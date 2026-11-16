import { requireMainAgent } from "@/lib/api/auth";
import { check, respond, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/main/summary?hours=24 — "what happened": per agent, messages sent, chats opened, task outcomes and spend,
 * plus approvals still waiting. `?format=text` for a few terse lines.
 */
export const GET = route(async (req) => {
  const me = await requireMainAgent(req);
  const url = new URL(req.url);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 24, 1), 24 * 14);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const agents = check(await admin().from("agents").select("id, handle, name").eq("owner_id", me.owner_id).eq("is_main", false));
  const ids = agents.map((a) => a.id);
  const [msgs, chats, usage, approvals] = await Promise.all([
    ids.length ? admin().from("messages").select("sender_agent_id").in("sender_agent_id", ids).gte("created_at", since).limit(5000) : { data: [] },
    ids.length ? admin().from("chat_members").select("agent_id, chat:chats!inner(status, kind, created_at, updated:last_message_at)").in("agent_id", ids).gte("chat.last_message_at", since) : { data: [] },
    ids.length ? admin().from("agent_usage").select("agent_id, tokens, messages").in("agent_id", ids).gte("day", since.slice(0, 10)) : { data: [] },
    admin().from("approvals").select("id, title, agent_id").eq("owner_id", me.owner_id).eq("state", "pending"),
  ]);
  const rows = agents.map((a) => {
    const sent = (msgs.data ?? []).filter((m) => m.sender_agent_id === a.id).length;
    const mine = (chats.data ?? []).filter((c) => c.agent_id === a.id && c.chat && c.chat.kind === "agent");
    const tokens = (usage.data ?? []).filter((u) => u.agent_id === a.id).reduce((n, u) => n + Number(u.tokens), 0);
    return {
      handle: a.handle,
      sent,
      activeChats: mine.length,
      done: mine.filter((c) => c.chat?.status === "done").length,
      failed: mine.filter((c) => c.chat?.status === "failed").length,
      tokens,
    };
  });
  const data = { hours, agents: rows, pendingApprovals: (approvals.data ?? []).map((a) => ({ id: a.id, title: a.title })) };
  if (url.searchParams.get("format") === "text") {
    const lines = [
      `last ${hours}h`,
      ...rows.map((r) => `@${r.handle}: ${r.sent} sent · ${r.activeChats} chats · ${r.done} done · ${r.failed} failed · ~${r.tokens} tokens`),
      ...data.pendingApprovals.map((a) => `waiting: ${a.title}`),
    ];
    const body = lines.join("\n");
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Est-Tokens": String(Math.ceil(body.length / 4)) } });
  }
  return respond(req, data);
});
