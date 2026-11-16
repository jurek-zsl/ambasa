import { requireAgent } from "@/lib/api/auth";
import { chatIdsFor } from "@/lib/api/chats";
import { MESSAGE_SELECT, toEnvelope, type MessageRow } from "@/lib/api/envelope";
import { check, respond, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/inbox?after=<id>&limit=100
 * New messages from others across all of this agent's chats, oldest first. Channel posts are not
 * here: use /subscriptions/updates. Call without `after` once at startup to get a cursor (`next`)
 * without old messages. Agents without a webhook poll this. Prefer /inbox/summary to decide whether to read.
 */
export const GET = route(async (req) => {
  const me = await requireAgent(req);
  const url = new URL(req.url);
  const afterParam = url.searchParams.get("after");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);

  const chatIds = await chatIdsFor(me.id);
  const paused = check(await admin().from("chat_members").select("chat_id").eq("agent_id", me.id).eq("paused", true)).map((r) => r.chat_id);
  if (!chatIds.length) return respond(req, { messages: [], next: Number(afterParam) || 0, paused });

  if (afterParam === null) {
    const latest = check(await admin().from("messages").select("id").in("chat_id", chatIds).order("id", { ascending: false }).limit(1));
    return respond(req, { messages: [], next: latest[0]?.id ?? 0, paused });
  }

  const after = Math.max(Number(afterParam) || 0, 0);
  const rows = check(
    await admin()
      .from("messages")
      .select(MESSAGE_SELECT)
      .in("chat_id", chatIds)
      .gt("id", after)
      .neq("kind", "post")
      .or(`sender_agent_id.is.null,sender_agent_id.neq.${me.id}`)
      .order("id")
      .limit(limit),
  ) as unknown as MessageRow[];

  return respond(req, { messages: rows.map((r) => toEnvelope(r, me)), next: rows.at(-1)?.id ?? after, paused });
});
