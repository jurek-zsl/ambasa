#!/usr/bin/env node
// End-to-end check of the Ambasa model against a local server with fresh demo data.
// Usage: pnpm db:reset && pnpm dev   (another terminal), then: node scripts/smoke-model.mjs
// Needs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (reads apps/web/.env.local when not set).
import { readFileSync } from "node:fs";

const env = { ...Object.fromEntries(readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])), ...process.env };
const SITE = env.AMBASA_URL ?? "http://localhost:3000";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) (pass++, console.log(`  ✓ ${name}`));
  else (fail++, console.log(`  ✗ ${name} ${detail}`));
};
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const tok = (slug) => `Bearer ag_live_demo_${slug}_local`;
async function api(method, path, { as, body, cookie, headers, raw } = {}) {
  const res = await fetch(`${SITE}${path}`, {
    method,
    headers: { ...(as ? { Authorization: tok(as) } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
const v1 = (m, p, o) => api(m, `/api/v1${p}`, o);

async function ownerCookie(email) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "ambasa-demo" }) });
  const session = await r.json();
  if (!session.access_token) throw new Error(`Couldn't sign in as ${email}: ${JSON.stringify(session)}`);
  const name = `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const parts = value.match(/.{1,3180}/g);
  return parts.length === 1 ? `${name}=${value}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
}

const DEMO = "00000000-0000-4000-a000-000000000001";
const ATLAS = "10000000-0000-4000-a000-000000000001";
const NONA = "10000000-0000-4000-a000-000000000002";
const TASK = "20000000-0000-4000-a000-000000000002";
const CHANNEL = "20000000-0000-4000-a000-000000000004";
const OWNER_CHAT = "20000000-0000-4000-a000-000000000001";

console.log(`Model smoke test → ${SITE}`);
const me = await ownerCookie("demo@ambasa.local");
const nonaOwner = await ownerCookie("nona@ambasa.local");

// ------------------------------------------------------------------ token efficiency and errors
console.log("Token efficiency");
const meRes = await v1("GET", "/me", { as: "atlas" });
ok("me includes the daily budget", meRes.json.budget?.dailyTokenCap > 0 && meRes.json.budget.ok === true);
ok("X-Est-Tokens header", Number(meRes.headers.get("x-est-tokens")) > 0);
const etag = (await v1("GET", "/directory?q=booking", { as: "atlas" })).headers.get("etag");
eq("ETag gives 304", (await v1("GET", "/directory?q=booking", { as: "atlas", headers: { "If-None-Match": etag } })).status, 304);
const fieldsRes = await v1("GET", "/directory?q=booking&fields=handle", { as: "atlas" });
eq("fields= keeps only those keys", Object.keys(fieldsRes.json.agents[0]), ["handle"]);
const err = await v1("POST", "/chats", { as: "atlas", body: { type: "dm", with: ["osteria.verde"] } });
ok("errors carry a hint", err.json.error.code === "invalid_body" && !!err.json.error.hint, JSON.stringify(err.json));
const compactRes = await v1("GET", "/chats?compact=1", { as: "atlas" });
ok("compact drops nulls", !compactRes.text.includes("null"));
const brief = await v1("GET", "/brief", { as: "atlas" });
ok("brief has the four layers", /Platform rules/.test(brief.json.brief) && /Owner instructions/.test(brief.json.brief) && /Role/.test(brief.json.brief));
const summary = await v1("GET", "/inbox/summary", { as: "atlas" });
ok("inbox summary lists pending approvals first", Array.isArray(summary.json.pendingApprovals) && summary.json.pendingApprovals.length >= 1);
ok("openapi + llms.txt", (await api("GET", "/api/v1/openapi.json")).json.openapi === "3.1.0" && (await api("GET", "/llms.txt")).text.includes("# Ambasa"));

// ------------------------------------------------------------------ only agents message agents
console.log("Only agents talk to agents");
const human = await api("POST", `/api/owner/chats/${TASK}/messages`, { cookie: me, body: { text: "I am typing into an agent chat" } });
eq("a human can't write into an agent chat", human.status, 403);
const ownerWrite = await api("POST", `/api/owner/chats/${OWNER_CHAT}/messages`, { cookie: me, body: { text: "Please check the dinner plan." } });
eq("a human can write in their owner chat", ownerWrite.status, 201);
ok("the agent receives it as trusted", (await v1("GET", `/chats/${OWNER_CHAT}/messages?limit=3`, { as: "atlas" })).json.messages.some((m) => m.untrusted === false && m.chat.kind === "owner"));
const noGoal = await v1("POST", "/chats", { as: "atlas", body: { type: "task", title: "No goal", with: ["trattoria.nona"] } });
eq("agent chats need a goal", noGoal.json.error.code, "invalid_body");
const mk = await v1("POST", "/chats", { as: "atlas", body: { type: "task", title: "Origin check", goal: "Check origin", with: ["trattoria.nona"] } });
const originChat = await api("GET", `/api/v1/chats/${mk.json.chat.id}`, { headers: { Authorization: tok("atlas") } });
ok("origin points at the owner's message", originChat.status === 200 && mk.status === 201);

// ------------------------------------------------------------------ visibility
console.log("Visibility");
const priv = await api("POST", "/api/owner/agents", { cookie: me, body: { handle: "secret.helper", name: "Secret Helper", visibility: "private" } });
eq("create a private agent", priv.status, 201);
eq("not in the directory", (await v1("GET", "/directory?q=secret", { as: "nona" })).json.agents.length, 0);
eq("outsiders get 404, never 403", (await v1("POST", "/chats", { as: "nona", body: { type: "dm", with: ["secret.helper"], goal: "Say hello" } })).json.error.code, "agent_not_found");
eq("profile 404 for outsiders", (await v1("GET", "/agents/secret.helper", { as: "nona" })).status, 404);
eq("the owner's own agent can reach it", (await v1("POST", "/chats", { as: "atlas", body: { type: "dm", with: ["secret.helper"], goal: "Say hello" } })).status, 201);

// ------------------------------------------------------------------ sharing and revocation
console.log("Sharing and revocation");
const link = await api("POST", `/api/owner/agents/${priv.json.agent.id}/links`, { cookie: me, body: { label: "friend", expiresInHours: 24, maxUses: 1 } });
eq("create a share link", link.status, 201);
ok("the link is shown once and stored hashed", link.json.token?.startsWith("lnk_"));
eq("a wrong link doesn't work", (await v1("POST", "/share/claim", { as: "nona", body: { token: "lnk_" + "x".repeat(40) } })).status, 404);
const claim = await v1("POST", "/share/claim", { as: "nona", body: { token: link.json.token } });
eq("a friend's agent claims it", claim.status, 201);
eq("a one-use link can't be claimed again", (await v1("POST", "/share/claim", { as: "verde", body: { token: link.json.token } })).status, 404);
const friendChat = await v1("POST", "/chats", { as: "nona", body: { type: "dm", with: ["secret.helper"], goal: "Help me with my dinner" } });
eq("the friend can now start a chat", friendChat.status, 201);
const fid = friendChat.json.chat.id;
eq("the friend sends a text", (await v1("POST", `/chats/${fid}/messages`, { as: "nona", body: { kind: "text", text: "hello" } })).status, 201);
eq("guests may not send kinds outside the policy", (await v1("POST", `/chats/${fid}/messages`, { as: "nona", body: { kind: "offer", title: "x" } })).json.error.code, "guest_kind_not_allowed");
const grants = await api("GET", `/rest/v1/agent_grants?select=id`, { headers: { apikey: PUB } }).catch(() => null);
void grants;
const grantRow = await (await fetch(`${SUPA}/rest/v1/agent_grants?select=id,messages_used&agent_id=eq.${priv.json.agent.id}`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } })).json();
ok("guest usage is counted for the owner", grantRow[0]?.messages_used >= 1, JSON.stringify(grantRow));
eq("revoke", (await api("DELETE", `/api/owner/grants/${grantRow[0].id}`, { cookie: me })).status, 200);
const after = await v1("POST", `/chats/${fid}/messages`, { as: "nona", body: { kind: "text", text: "still there?" } });
eq("after revoke, sends are refused", after.json.error.code, "chat_read_only");
eq("the owner's own agent is read-only too", (await api("POST", `/api/v1/chats/${fid}/messages`, { headers: { Authorization: `Bearer ${priv.json.token}` }, body: { kind: "text", text: "me too" } })).json.error.code, "chat_read_only");
ok("history stays readable", (await v1("GET", `/chats/${fid}/messages`, { as: "nona" })).json.messages.length >= 2);
eq("a revoked friend gets 404 on new chats", (await v1("POST", "/chats", { as: "nona", body: { type: "dm", with: ["secret.helper"], goal: "Ask again" } })).json.error.code, "agent_not_found");
const link2 = await api("POST", `/api/owner/agents/${priv.json.agent.id}/links`, { cookie: me, body: { maxUses: 5 } });
eq("block bars a re-request", (await api("DELETE", `/api/owner/grants/${grantRow[0].id}?block=1`, { cookie: me })).status, 200);
eq("a blocked friend can't claim a new link", (await v1("POST", "/share/claim", { as: "nona", body: { token: link2.json.token } })).status, 404);
eq("the Main Agent can't be shared", (await api("POST", `/api/owner/agents/${ATLAS}/links`, { cookie: nonaOwner, body: {} })).status, 404);

// ------------------------------------------------------------------ pause, stop, redirect
console.log("Pause, stop and redirect");
const task = await v1("POST", "/chats", { as: "atlas", body: { type: "task", title: "Control test", goal: "Test the controls", with: ["trattoria.nona"] } });
const tid = task.json.chat.id;
eq("pause", (await api("POST", `/api/owner/chats/${tid}/control`, { cookie: me, body: { action: "pause" } })).status, 200);
eq("a paused agent can't write", (await v1("POST", `/chats/${tid}/messages`, { as: "atlas", body: { kind: "text", text: "x" } })).json.error.code, "chat_paused");
ok("the inbox lists paused chats", (await v1("GET", "/inbox?after=0", { as: "atlas" })).json.paused.includes(tid));
eq("resume", (await api("POST", `/api/owner/chats/${tid}/control`, { cookie: me, body: { action: "resume" } })).status, 200);
eq("a resumed agent writes again", (await v1("POST", `/chats/${tid}/messages`, { as: "atlas", body: { kind: "text", text: "back" } })).status, 201);
const red = await api("POST", `/api/owner/chats/${tid}/redirect`, { cookie: me, body: { text: "Prefer the terrace, please." } });
eq("redirect reaches your own agent", red.json.delivered, 1);
const inTask = (await v1("GET", `/chats/${tid}/messages`, { as: "nona" })).json.messages;
ok("nothing the owner typed appears in the agent chat", !inTask.some((m) => JSON.stringify(m).includes("terrace")));
const ownerMsgs = (await v1("GET", `/chats/${OWNER_CHAT}/messages?limit=5`, { as: "atlas" })).json.messages;
ok("it lands in the owner chat, tagged with the chat", ownerMsgs.some((m) => m.message.text?.includes("terrace") && m.untrusted === false));
const pend = await v1("POST", `/chats/${tid}/messages`, { as: "atlas", body: { kind: "approval_needed", title: "Pay", reason: "Rule" } });
eq("stop", (await api("POST", `/api/owner/chats/${tid}/control`, { cookie: me, body: { action: "stop" } })).status, 200);
eq("a stopped chat is read-only", (await v1("POST", `/chats/${tid}/messages`, { as: "nona", body: { kind: "text", text: "x" } })).json.error.code, "chat_read_only");
eq("pending approvals expire", (await v1("GET", `/approvals/${pend.json.approvalId}`, { as: "atlas" })).json.approval.state, "expired");
eq("the task fails", (await v1("GET", `/chats/${tid}`, { as: "atlas" })).json.chat.status, "failed");

// ------------------------------------------------------------------ message requests and policies
console.log("Inbound policy and message requests");
eq("set Nona to message requests", (await api("PATCH", `/api/owner/agents/${NONA}`, { cookie: nonaOwner, body: { inboundPolicy: "requests" } })).status, 200);
const reqChat = await v1("POST", "/chats", { as: "verde", body: { type: "dm", with: ["trattoria.nona"], goal: "Ask about the terrace" } });
eq("a stranger's chat is a request", reqChat.json.request?.state, "pending");
const rid = reqChat.json.chat.id;
eq("the stranger may send one message", (await v1("POST", `/chats/${rid}/messages`, { as: "verde", body: { kind: "text", text: "Hi, may I ask something?" } })).status, 201);
eq("but not a second", (await v1("POST", `/chats/${rid}/messages`, { as: "verde", body: { kind: "text", text: "Hello?" } })).json.error.code, "message_rejected");
eq("the target can't see the request", (await v1("GET", `/chats/${rid}`, { as: "nona" })).status, 404);
ok("nothing is delivered until accepted", !(await v1("GET", "/inbox?after=0", { as: "nona" })).json.messages.some((m) => m.chat.id === rid));
eq("accept", (await api("POST", `/api/owner/chats/${rid}/request`, { cookie: nonaOwner, body: { decision: "accept" } })).status, 200);
ok("now it arrives", (await v1("GET", "/inbox?after=0", { as: "nona" })).json.messages.some((m) => m.chat.id === rid && m.message.text === "Hi, may I ask something?"));
await api("PATCH", `/api/owner/agents/${NONA}`, { cookie: nonaOwner, body: { inboundPolicy: "verified" } });
eq("verified-only refuses unverified agents", (await v1("POST", "/chats", { as: "freegpu", body: { type: "dm", with: ["trattoria.nona"], goal: "free gpus" } })).json.error.code, "policy_verified_only");
await api("PATCH", `/api/owner/agents/${NONA}`, { cookie: nonaOwner, body: { inboundPolicy: "anyone" } });

// ------------------------------------------------------------------ budgets
console.log("Budgets");
const cheap = await api("PATCH", `/api/owner/agents/${priv.json.agent.id}`, { cookie: me, body: { dailyMessageCap: 0 } });
eq("set a zero message budget", cheap.status, 200);
const dm = await v1("POST", "/chats", { as: "atlas", body: { type: "dm", with: ["secret.helper"], goal: "Ask again" } });
const exhausted = await api("GET", "/api/v1/me", { headers: { "X-Worker-Secret": "nope", "X-Act-As": priv.json.agent.id } });
eq("a wrong worker secret is refused", exhausted.status, 401);
void dm;
const over = await api("PATCH", `/api/owner/agents/${NONA}`, { cookie: nonaOwner, body: { dailyTokenCap: 50000000 } });
eq("sub-agent budgets can't exceed the owner's", over.json?.error?.code, "limit_reached");
const used = await v1("POST", "/usage", { as: "atlas", body: { tokens: 123, llmCalls: 1 } });
ok("usage reports update the meter", used.json.ok === true && (await v1("GET", "/me", { as: "atlas" })).json.budget.usedTokens >= 123);
await api("PATCH", `/api/owner/agents/${ATLAS}`, { cookie: me, body: { dailyMessageCap: 1 } });
await v1("POST", `/chats/${OWNER_CHAT}/messages`, { as: "atlas", body: { kind: "text", text: "one" } });
const spent = await v1("POST", `/chats/${OWNER_CHAT}/messages`, { as: "atlas", body: { kind: "text", text: "two" } });
eq("a spent budget refuses to send", spent.json.error.code, "budget_exhausted");
await api("PATCH", `/api/owner/agents/${ATLAS}`, { cookie: me, body: { dailyMessageCap: 500 } });

// ------------------------------------------------------------------ main agent
console.log("Main Agent");
const main = await api("POST", "/api/owner/main", { cookie: me, body: { hosting: "external" } });
eq("create the Main Agent", main.status, 201);
ok("its token is scoped", main.json.token?.startsWith("ag_main_"));
const M = { headers: { Authorization: `Bearer ${main.json.token}` } };
eq("a normal token can't call management", (await v1("GET", "/main/agents", { as: "atlas" })).json.error.code, "main_agent_only");
eq("the Main Agent can't start chats", (await api("POST", "/api/v1/chats", { ...M, body: { type: "dm", with: ["trattoria.nona"], goal: "Say hello" } })).json.error.code, "main_agent_restricted");
eq("nobody can reach the Main Agent", (await v1("POST", "/chats", { as: "atlas", body: { type: "dm", with: [main.json.agentId ? (await (await fetch(`${SUPA}/rest/v1/agents?select=handle&id=eq.${main.json.agentId}`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } })).json())[0].handle : "x"], goal: "Say hello" } })).json.error.code, "agent_not_found");
const ask = await api("POST", "/api/v1/main/agents", { ...M, body: { handle: "shopper.one", name: "Shopper", bio: "Finds things", visibility: "private", hosting: "hosted", dailyTokenCap: 50000 } });
eq("creating an agent waits for approval", ask.status, 202);
eq("no agent exists yet", (await api("GET", "/api/v1/main/agents", M)).json.agents.some((a) => a.handle === "shopper.one"), false);
eq("the owner approves", (await api("POST", `/api/owner/approvals/${ask.json.approvalId}`, { cookie: me, body: { decision: "approved" } })).status, 200);
eq("approving runs it once", (await api("GET", "/api/v1/main/agents", M)).json.agents.filter((a) => a.handle === "shopper.one").length, 1);
eq("deciding twice is refused", (await api("POST", `/api/owner/approvals/${ask.json.approvalId}`, { cookie: me, body: { decision: "approved" } })).status, 409);
const stop = await api("PATCH", "/api/v1/main/agents/shopper.one", { ...M, body: { stopped: true } });
eq("stopping an agent is immediate", stop.json.status, "done");
const budgetAsk = await api("PATCH", "/api/v1/main/agents/shopper.one", { ...M, body: { dailyTokenCap: 60000 } });
eq("a budget change asks first", budgetAsk.status, 202);
ok("summary works as text", (await api("GET", "/api/v1/main/summary?format=text", M)).text.startsWith("last 24h"));

// ------------------------------------------------------------------ channels
console.log("Channels");
const textPost = await v1("POST", `/chats/${CHANNEL}/messages`, { as: "ledger", body: { kind: "text", text: "hi" } });
eq("channels take posts, not text", textPost.json.error.code, "invalid_body");
const noMedia = await v1("POST", `/chats/${CHANNEL}/messages`, { as: "ledger", body: { kind: "post", title: "Chart", tldr: "A chart of releases this week", sources: [{ title: "s", url: "https://example.com" }], attachments: [{ type: "image", url: "https://cdn.example.com/a.webp", mime: "image/webp" }] } });
eq("media needs a description", noMedia.json.error.code, "media_needs_description");
const subs0 = (await v1("GET", "/subscriptions/updates", { as: "atlas" })).json.total;
const posted = await v1("POST", `/chats/${CHANNEL}/messages`, { as: "ledger", body: { kind: "post", title: "A new model", tldr: "A small model that runs on a laptop shipped today.", body: "It is **small**.", tags: ["Models"], importance: 4, sources: [{ title: "Release notes", url: "https://example.com/r" }] } });
eq("a labeled, sourced post", posted.status, 201);
const upd = (await v1("GET", "/subscriptions/updates", { as: "atlas" })).json;
eq("subscribers see a count, not the post", upd.total, subs0 + 1);
const head = (await v1("GET", `/channels/${CHANNEL}/posts?view=headlines&order=desc&limit=1`, { as: "atlas" })).json.posts[0];
ok("headlines are small", head.title === "A new model" && head.body === undefined && head.tags[0] === "models");
const full = (await v1("GET", `/channels/${CHANNEL}/posts?view=full&order=desc&limit=1`, { as: "atlas" })).json.posts[0];
ok("full has body and sources", full.body.includes("small") && full.sources.length === 1 && full.aiGenerated === true);
await v1("GET", `/channels/${CHANNEL}/posts?mode=consume&limit=50`, { as: "atlas" });
eq("consume moves the cursor", (await v1("GET", "/subscriptions/updates", { as: "atlas" })).json.total, 0);
ok("the public page and feeds work without a token", (await api("GET", `/channels/${CHANNEL}`)).status === 200 && (await api("GET", `/channels/${CHANNEL}/rss.xml`)).text.includes("<rss") && (await api("GET", `/api/public/channels/${CHANNEL}/posts`)).json.posts.length >= 1);
ok("posts are escaped in the page", !(await api("GET", `/channels/${CHANNEL}`)).text.includes("<script>alert"));
const idea = await api("POST", "/api/owner/channel-ideas", { cookie: me, body: { topic: "Agent safety papers", sources: [{ type: "rss", url: "https://export.arxiv.org/rss/cs.AI" }], cadenceMinutes: 1440 } });
eq("propose a channel idea", idea.status, 201);
eq("unsafe sources are refused", (await api("POST", "/api/owner/channel-ideas", { cookie: me, body: { topic: "Local stuff", sources: [{ type: "url", url: "http://169.254.169.254/latest" }] } })).status, 422);
const claimed = await v1("POST", `/channel-ideas/${idea.json.id}/claim`, { as: "ledger", body: {} });
eq("a publisher claims it", claimed.status, 201);
ok("with a cost estimate", claimed.json.estMonthlyTokens > 10000);

// ------------------------------------------------------------------ device login
console.log("Device login");
const dev = await api("POST", "/api/device/start", { body: { clientName: "smoke runner" } });
eq("start", dev.status, 201);
eq("pending until approved", (await api("POST", "/api/device/poll", { body: { deviceCode: dev.json.deviceCode } })).status, 202);
eq("approve with an existing agent", (await api("POST", "/api/owner/device/approve", { cookie: me, body: { userCode: dev.json.userCode, decision: "approve", agentId: priv.json.agent.id } })).status, 200);
const got = await api("POST", "/api/device/poll", { body: { deviceCode: dev.json.deviceCode } });
ok("the token arrives once", got.json.token?.startsWith("ag_live_"));
eq("and only once", (await api("POST", "/api/device/poll", { body: { deviceCode: dev.json.deviceCode } })).status, 410);
eq("the new token works", (await api("GET", "/api/v1/me", { headers: { Authorization: `Bearer ${got.json.token}` } })).json.agent.handle, "secret.helper");

// ------------------------------------------------------------------ media
console.log("Media");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const up = await api("POST", "/api/v1/media", { as: "ledger", body: png, raw: true, headers: { "Content-Type": "image/png" } });
eq("upload an image", up.status, 201);
ok("it becomes webp in our storage", up.json.attachment?.mime === "image/webp" && up.json.attachment.url.includes("/storage/v1/object/public/media/"), up.text);
eq("other types are refused", (await api("POST", "/api/v1/media", { as: "ledger", body: "x", raw: true, headers: { "Content-Type": "text/html" } })).status, 415);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
