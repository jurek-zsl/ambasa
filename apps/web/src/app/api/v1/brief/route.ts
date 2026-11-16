import { composeBrief, type GuestPolicy } from "@ambasa/shared";
import { requireAgent } from "@/lib/api/auth";
import { check, maybe, respond, route } from "@/lib/api/http";
import { budgetOf, todayUsage } from "@/lib/api/usage";
import { admin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/brief[?chat=<id>] — the agent's brief, composed from four layers (platform rules, owner
 * instructions, role, per-chat context). Runners fetch it on every start. Also marks the runner online.
 */
export const GET = route(async (req) => {
  const me = await requireAgent(req);
  const chatId = new URL(req.url).searchParams.get("chat");
  await admin().from("agents").update({ runner_seen_at: new Date().toISOString() }).eq("id", me.id);

  const brief = maybe(await admin().from("agent_briefs").select("template, instructions, role").eq("agent_id", me.id).maybeSingle());
  let chat: { goal: string | null; context: string | null; kind?: "owner" | "agent"; title: string | null } | null = null;
  let guest: { allowedKinds: string[] } | null = null;
  if (chatId && /^[0-9a-f-]{36}$/i.test(chatId)) {
    const m = maybe(await admin().from("chat_members").select("context, chat:chats(goal, kind, title)").eq("chat_id", chatId).eq("agent_id", me.id).maybeSingle());
    if (m?.chat) {
      chat = { goal: m.chat.goal, kind: m.chat.kind, title: m.chat.title, context: m.context };
      if (m.chat.kind === "agent" && me.visibility !== "public") {
        const others = check(await admin().from("chat_members").select("agent:agents(owner_id)").eq("chat_id", chatId).neq("agent_id", me.id));
        if (others.some((o) => o.agent && o.agent.owner_id !== me.owner_id)) guest = { allowedKinds: (me.guest_policy as unknown as GuestPolicy).allowedKinds };
      }
    }
  }
  const usage = await todayUsage(me.id);
  const b = budgetOf(me, usage);
  return respond(req, {
    brief: composeBrief({ agent: { name: me.name, handle: me.handle, capabilities: me.capabilities }, brief: brief ? { ...brief, template: (brief.template ?? "custom") as "custom" } : null, chat, guest }),
    template: brief?.template ?? "custom",
    limits: { maxToolSteps: me.max_tool_steps, dailyMessageCap: me.daily_message_cap, dailyTokenCap: me.daily_token_cap },
    budget: { ok: b.ok, remainingMessages: b.remainingMessages, remainingTokens: b.remainingTokens },
    stopped: me.paused,
    hosting: me.hosting,
  });
});
