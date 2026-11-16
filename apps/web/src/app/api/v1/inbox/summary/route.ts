import { requireAgent } from "@/lib/api/auth";
import { chatIdsFor } from "@/lib/api/chats";
import { check, json, respond, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/**
 * GET /api/v1/inbox/summary?after=<id> — counts per chat since a cursor, pending approvals first.
 * Cheap enough to call on every wake-up: read this, then fetch only the chats that matter.
 * `?format=text` returns a few terse lines for LLM consumers.
 */
export const GET = route(async (req) => {
  const me = await requireAgent(req);
  const url = new URL(req.url);
  const after = Math.max(Number(url.searchParams.get("after")) || 0, 0);
  const chatIds = await chatIdsFor(me.id);

  const approvals = check(
    await admin().from("approvals").select("id, chat_id, title, expires_at").eq("agent_id", me.id).eq("state", "pending").order("created_at"),
  );
  const rows = chatIds.length
    ? check(
        await admin()
          .from("messages")
          .select("id, chat_id, kind, flagged, sender_agent_id")
          .in("chat_id", chatIds)
          .gt("id", after)
          .neq("kind", "post")
          .or(`sender_agent_id.is.null,sender_agent_id.neq.${me.id}`)
          .order("id")
          .limit(1000),
      )
    : [];

  const by = new Map<string, { chatId: string; unread: number; flagged: number; lastId: number }>();
  for (const r of rows) {
    const c = by.get(r.chat_id) ?? { chatId: r.chat_id, unread: 0, flagged: 0, lastId: 0 };
    c.unread++;
    if (r.flagged) c.flagged++;
    c.lastId = r.id;
    by.set(r.chat_id, c);
  }
  const titles = by.size
    ? check(await admin().from("chats").select("id, title, type, status, frozen").in("id", [...by.keys()]))
    : [];
  const chats = [...by.values()].map((c) => {
    const t = titles.find((x) => x.id === c.chatId);
    return { ...c, title: t?.title ?? null, type: t?.type, status: t?.status ?? null, frozen: t?.frozen ?? false };
  });
  const next = rows.at(-1)?.id ?? after;
  const data = { pendingApprovals: approvals.map((a) => ({ id: a.id, chatId: a.chat_id, title: a.title, expiresAt: a.expires_at })), chats, next };

  if (url.searchParams.get("format") === "text") {
    const lines = [
      ...data.pendingApprovals.map((a) => `approval ${a.id} · ${a.title}`),
      ...chats.map((c) => `${c.chatId} · ${c.title ?? c.type} · ${c.unread} new${c.flagged ? ` (${c.flagged} flagged)` : ""}${c.frozen ? " · read-only" : ""}`),
      `next=${next}`,
    ];
    const body = lines.join("\n");
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Est-Tokens": String(Math.ceil(body.length / 4)) } });
  }
  return url.searchParams.get("etag") === "0" ? json(data) : respond(req, data);
});
