// Local integration checks. Creates isolated accounts and removes only its own fixtures.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
process.loadEnvFile("apps/web/.env.local");
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert(
  new URL(url).hostname === "127.0.0.1",
  "Only run against the local database.",
);
const db = createClient(url, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const base = process.env.WORKSPACE_TEST_URL ?? "http://localhost:3000";
const ids = [];
async function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function account() {
  const email = `workspace-${randomUUID()}@ambasa.local`,
    password = randomUUID();
  const user = await checked(
    await db.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  ids.push(user.user.id);
  const jar = new Map();
  const sb = createServerClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (rows) => rows.forEach((r) => jar.set(r.name, r.value)),
      },
    },
  );
  await checked(await sb.auth.signInWithPassword({ email, password }));
  const request = async (path, body, method = "POST", expected = 200) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await res.json();
    assert.equal(
      res.status,
      expected,
      `${method} ${path}: ${JSON.stringify(value)}`,
    );
    return value;
  };
  return { sb, request, userId: user.user.id };
}
try {
  const a = await account(),
    b = await account();
  const main = await a.request(
    "/api/owner/main",
    { hosting: "hosted", template: "researcher" },
    "POST",
    201,
  );
  const brief = await checked(
    await db
      .from("agent_briefs")
      .select("instructions")
      .eq("agent_id", main.agentId)
      .single(),
  );
  assert.match(brief.instructions, /Owner preference/);
  await a.request(
    `/api/owner/agents/${main.agentId}/readiness`,
    {},
    "POST",
    409,
  );
  await b.request(
    `/api/owner/agents/${main.agentId}/readiness`,
    undefined,
    "GET",
    404,
  );
  const preset = (
    await a.request("/api/owner/presets", {
      agentId: main.agentId,
      title: "Integration research",
      instructions: "Research local fixture data only.",
      intervalMinutes: 60,
      enabled: true,
    })
  ).preset;
  await b.request(
    "/api/owner/presets",
    {
      id: preset.id,
      agentId: main.agentId,
      title: "No access",
      instructions: "Must not update.",
    },
    "POST",
    404,
  );
  await checked(
    await db
      .from("task_presets")
      .update({ next_run_at: new Date(Date.now() - 60000).toISOString() })
      .eq("id", preset.id),
  );
  // Missing hosted keys cannot trigger paid work.
  const before = await checked(
    await db
      .from("messages")
      .select("id", { count: "exact" })
      .eq("chat_id", main.ownerChatId),
  );
  await checked(await db.rpc("run_due_presets"));
  const after = await checked(
    await db.from("messages").select("id").eq("chat_id", main.ownerChatId),
  );
  assert.equal(before.length, after.length);
  await checked(
    await db
      .from("agents")
      .update({ hosting: "runner", runner_seen_at: new Date().toISOString() })
      .eq("id", main.agentId),
  );
  const concurrent = await Promise.all([
    db.rpc("run_due_presets"),
    db.rpc("run_due_presets"),
  ]);
  assert.equal(
    concurrent.reduce((n, r) => n + Number(r.data ?? 0), 0),
    1,
    "One scheduled occurrence under concurrent schedulers",
  );
  const scheduled = await checked(
    await db.from("messages").select("id,body").eq("chat_id", main.ownerChatId),
  );
  assert.equal(
    scheduled.filter((m) => m.body?.preset_id === preset.id).length,
    1,
  );
  const foreignWorkspace = await b.request(
    "/api/owner/workspace",
    undefined,
    "GET",
  );
  assert(!foreignWorkspace.presets.some((p) => p.id === preset.id));
  const channels = await checked(
    await a.sb
      .from("messages")
      .select("id,chat_id")
      .eq("kind", "post")
      .is("removed_at", null)
      .limit(1),
  );
  if (channels.length) {
    const m = channels[0];
    await a.request("/api/owner/reading", {
      chatId: m.chat_id,
      saveId: m.id,
      lastReadId: m.id,
    });
    let workspace = await a.request("/api/owner/workspace", undefined, "GET");
    assert(
      workspace.reading
        .find((r) => r.chat_id === m.chat_id)
        .saved_ids.includes(m.id),
    );
    await a.request("/api/owner/reading", { chatId: m.chat_id, saveId: m.id });
    workspace = await a.request("/api/owner/workspace", undefined, "GET");
    assert(
      !workspace.reading
        .find((r) => r.chat_id === m.chat_id)
        .saved_ids.includes(m.id),
    );
  }
  await a.request(
    "/api/owner/push",
    {
      endpoint: "https://127.0.0.1/private",
      keys: { p256dh: "x".repeat(30), auth: "x".repeat(20) },
    },
    "POST",
    400,
  );
  await a.request("/api/owner/rates", {
    provider: "test",
    model: "fixture",
    input: 1,
    output: 2,
  });
  const mainRequest = async (path, body, expected = 200) => {
    const res = await fetch(`${base}/api/v1/main/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${main.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    assert.equal(res.status, expected, JSON.stringify(data));
    return data;
  };
  const handle = `test.${randomUUID().slice(0, 8)}`;
  const creation = await mainRequest(
    "agents",
    {
      handle,
      name: "Test specialist",
      hosting: "external",
      visibility: "private",
      dailyTokenCap: 100,
    },
    202,
  );
  await a.request(`/api/owner/approvals/${creation.approvalId}`, {
    decision: "approved",
  });
  const createdReceipt = await checked(
    await db
      .from("approvals")
      .select("execution_state")
      .eq("id", creation.approvalId)
      .single(),
  );
  assert.equal(createdReceipt.execution_state, "succeeded");
  const delegation = await mainRequest(
    "tasks",
    { handle, goal: "Research the local integration fixture." },
    202,
  );
  await a.request(`/api/owner/approvals/${delegation.approvalId}`, {
    decision: "approved",
  });
  const specialist = await checked(
    await db
      .from("agents")
      .select("id")
      .eq("owner_id", a.userId)
      .eq("handle", handle)
      .single(),
  );
  const specialistChat = await checked(
    await db
      .from("chats")
      .select("id")
      .eq("kind", "owner")
      .eq("created_by", specialist.id)
      .single(),
  );
  const delegated = await checked(
    await db
      .from("messages")
      .select("kind,sender_user_id,body")
      .eq("chat_id", specialistChat.id)
      .contains("body", { owner_delegation: true }),
  );
  assert.equal(delegated.length, 1);
  assert.equal(
    delegated[0].sender_user_id,
    null,
    "Platform delegation must never impersonate a human",
  );
  const usageResponse = await fetch(`${base}/api/v1/usage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${main.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tokens: 17,
      llmCalls: 1,
      inputTokens: 14,
      outputTokens: 3,
      model: "fixture",
      provider: "test",
      chatId: main.ownerChatId,
    }),
  });
  assert.equal(usageResponse.status, 200);
  const usageWorkspace = await a.request(
    "/api/owner/workspace",
    undefined,
    "GET",
  );
  assert(
    usageWorkspace.modelUsage.some(
      (r) =>
        r.agent_id === main.agentId &&
        r.input_tokens === 14 &&
        r.output_tokens === 3,
    ),
  );
  const action = {
    type: "update_agent",
    handle: "does.not.exist",
    changes: { dailyTokenCap: 10 },
  };
  const message = await checked(
    await db
      .from("messages")
      .insert({
        chat_id: main.ownerChatId,
        sender_agent_id: main.agentId,
        kind: "approval_needed",
        body: {
          title: "Failure receipt test",
          reason: "Local integration test",
          fields: { dailyTokenCap: "10" },
          action,
        },
        expects_reply: false,
      })
      .select("id")
      .single(),
  );
  const approval = await checked(
    await db
      .from("approvals")
      .select("id")
      .eq("message_id", message.id)
      .single(),
  );
  await b.request(
    `/api/owner/approvals/${approval.id}`,
    { decision: "approved" },
    "POST",
    409,
  );
  await a.request(`/api/owner/approvals/${approval.id}`, {
    decision: "approved",
  });
  const receipt = await checked(
    await db
      .from("approvals")
      .select("execution_state")
      .eq("id", approval.id)
      .single(),
  );
  assert.equal(receipt.execution_state, "failed");
  await a.request(
    `/api/owner/approvals/${approval.id}`,
    { decision: "approved" },
    "POST",
    409,
  );
  await a.request("/api/owner/presets", { id: preset.id }, "DELETE");
  console.log(
    "Workspace integration passed: ownership isolation, chosen onboarding focus, missing-key recovery, concurrent scheduling, saved-post toggling, push endpoint validation, rates, and failed execution receipts.",
  );
} finally {
  for (const id of ids) await db.auth.admin.deleteUser(id);
}
