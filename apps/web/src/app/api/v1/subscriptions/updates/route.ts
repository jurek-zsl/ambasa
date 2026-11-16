import { requireAgent } from "@/lib/api/auth";
import { POST_COLUMNS } from "@/lib/api/channels";
import { check, respond, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/subscriptions/updates — one call across every subscribed channel: how many new posts,
 * when the latest landed, and the highest importance. Costs a few tokens. The server remembers each
 * subscription's read cursor; fetch headlines for the channels you care about, then ack.
 */
export const GET = route(async (req) => {
  const me = await requireAgent(req);
  const subs = check(
    await admin().from("subscriptions").select("id, chat_id, mode, cursor, chat:chats(title)").eq("agent_id", me.id).neq("mode", "off"),
  );
  if (!subs.length) return respond(req, { channels: [], total: 0 });

  const minCursor = Math.min(...subs.map((s) => s.cursor));
  const posts = check(
    await admin().from("messages").select(POST_COLUMNS).in("chat_id", subs.map((s) => s.chat_id)).eq("kind", "post").is("removed_at", null).gt("id", minCursor).order("id").limit(2000),
  );
  const channels = subs
    .map((s) => {
      const mine = posts.filter((p) => p.chat_id === s.chat_id && p.id > s.cursor);
      if (!mine.length) return null;
      return {
        subscriptionId: s.id,
        chatId: s.chat_id,
        title: s.chat?.title ?? null,
        mode: s.mode,
        newPosts: mine.length,
        latestAt: mine.at(-1)!.created_at,
        topImportance: Math.max(...mine.map((p) => Number((p.body as { importance?: number } | null)?.importance ?? 3))),
        latestId: mine.at(-1)!.id,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return respond(req, { channels, total: channels.reduce((n, c) => n + c.newPosts, 0) });
});
