// Private attachment integration. Isolated local accounts; no external agents or models.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
process.loadEnvFile("apps/web/.env.local");
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const sharp = require("sharp");
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(dbUrl).hostname, "127.0.0.1");
const base = process.env.WORKSPACE_TEST_URL ?? "http://localhost:3000";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const db = createClient(dbUrl, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const accounts = [];
async function checked(query) {
  if (query.error) throw new Error(query.error.message);
  return query.data;
}
async function account() {
  const email = `files-${randomUUID()}@ambasa.local`,
    password = randomUUID();
  const { user } = await checked(
    await db.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  accounts.push(user.id);
  const cookies = new Map();
  const sb = createServerClient(
    dbUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (rows) =>
          rows.forEach((row) => cookies.set(row.name, row.value)),
      },
    },
  );
  await checked(await sb.auth.signInWithPassword({ email, password }));
  const raw = (path, options = {}) =>
    fetch(`${base}${path}`, {
      ...options,
      headers: {
        Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...options.headers,
      },
    });
  const json = async (path, body, expected = 200) => {
    const res = await raw(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await res.json();
    assert.equal(res.status, expected, JSON.stringify(value));
    return value;
  };
  return { sb, raw, json, id: user.id };
}
try {
  const a = await account(),
    b = await account();
  const main = await a.json("/api/owner/main", { hosting: "external" }, 201);
  const other = await b.json("/api/owner/main", { hosting: "external" }, 201);
  const upload = async (
    owner,
    name,
    bytes,
    chatId = main.ownerChatId,
    expected = 201,
  ) => {
    const response = await owner.raw(`/api/owner/chats/${chatId}/attachments`, {
      method: "POST",
      headers: {
        "X-File-Name": encodeURIComponent(name),
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value;
  };
  const text = Buffer.from(
    "Attachment integration fixture. Nothing private.\n",
  );
  await upload(b, "note.txt", text, main.ownerChatId, 403);
  await upload(a, "payload.html", text, main.ownerChatId, 415);
  await upload(a, "empty.txt", Buffer.alloc(0), main.ownerChatId, 400);
  await upload(a, "bad.png", text, main.ownerChatId, 400);
  const oversizedDimensions = await sharp({
    create: { width: 1, height: 20001, channels: 3, background: "#171717" },
  }).png().toBuffer();
  await upload(a, "too-tall.png", oversizedDimensions, main.ownerChatId, 400);
  const image = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#efb8cf" },
  })
    .png()
    .toBuffer();
  const photo = await upload(a, `${"p".repeat(176)}.png`, image);
  assert.equal(photo.mime, "image/webp");
  assert.equal(photo.type, "image");
  assert.equal(photo.name.length, 180);
  const document = await upload(a, "note.txt", text);
  assert.equal((await a.raw(document.url)).status, 200);
  assert.equal((await b.raw(document.url)).status, 404);
  assert.equal((await fetch(`${base}${document.url}`)).status, 401);
  const { storage_path: path } = await checked(
    await db
      .from("owner_attachments")
      .select("storage_path")
      .eq("id", document.id)
      .single(),
  );
  const publicResponse = await fetch(
    `${dbUrl}/storage/v1/object/public/owner-attachments/${path}`,
  );
  assert.notEqual(publicResponse.status, 200);
  await b.json(
    `/api/owner/chats/${other.ownerChatId}/messages`,
    {
      text: "Must not steal another owner's file.",
      attachmentIds: [document.id],
    },
    403,
  );
  const token = `ag_main_${randomUUID().replaceAll("-", "")}`;
  await checked(
    await db
      .from("agent_credentials")
      .update({ token_hash: createHash("sha256").update(token).digest("hex") })
      .eq("agent_id", main.agentId),
  );
  const agentRequest = (path) =>
    fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(
    (await agentRequest(document.url)).status,
    404,
    "Agent cannot read an upload before it is sent.",
  );
  const nonce = randomUUID();
  const [one, two] = await Promise.all([
    a.json(
      `/api/owner/chats/${main.ownerChatId}/messages`,
      {
        text: "Test attachments",
        attachmentIds: [photo.id, document.id],
        clientId: nonce,
      },
      201,
    ),
    a.json(
      `/api/owner/chats/${main.ownerChatId}/messages`,
      {
        text: "Test attachments",
        attachmentIds: [photo.id, document.id],
        clientId: nonce,
      },
      201,
    ),
  ]);
  assert.equal(one.id, two.id, "Retried send must commit exactly once.");
  const stored = await checked(
    await db.from("messages").select("attachments").eq("id", one.id).single(),
  );
  assert.equal(stored.attachments.length, 2);
  assert(
    stored.attachments.every(
      (file) => file.private && file.url.startsWith("/api/attachments/"),
    ),
  );
  const bytes = await agentRequest(document.url);
  assert.equal(bytes.status, 200);
  assert.equal(await bytes.text(), text.toString());
  const head = await a.raw(document.url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type"), /^text\/plain/);
  assert.match(head.headers.get("content-disposition"), /^attachment/);
  const ranged = await a.raw(document.url, { headers: { Range: "bytes=0-9" } });
  assert.equal(ranged.status, 206);
  assert.equal((await ranged.arrayBuffer()).byteLength, 10);
  assert.equal(
    (await a.raw(document.url, { method: "DELETE" })).status,
    409,
    "Sent files cannot be discarded as draft uploads.",
  );
  await a.json(
    `/api/owner/chats/${main.ownerChatId}/messages`,
    { text: "Reuse must fail", attachmentIds: [document.id] },
    403,
  );
  const pending = await upload(a, "discard.txt", text);
  assert.equal((await a.raw(pending.url, { method: "DELETE" })).status, 200);
  assert.equal((await a.raw(pending.url)).status, 404);
  const deletion = await a.raw("/api/owner/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  assert.equal(deletion.status, 200);
  const gone = await db.storage.from("owner-attachments").download(path);
  assert(gone.error, "Deleting the account must remove its private files.");
  console.log(
    "Attachment integration passed: private storage, ownership isolation, image processing, attachment delivery, agent access, byte ranges, draft deletion, and concurrent idempotent sending.",
  );
} finally {
  for (const id of accounts) {
    const { data: files } = await db
      .from("owner_attachments")
      .select("storage_path")
      .eq("owner_id", id);
    if (files?.length)
      await db.storage
        .from("owner-attachments")
        .remove(files.map((file) => file.storage_path));
    await db.auth.admin.deleteUser(id);
  }
}
