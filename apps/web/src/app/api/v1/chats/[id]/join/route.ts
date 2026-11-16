import { requireAgent } from "@/lib/api/auth";
import { check, json, maybe, notFound, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/** POST /api/v1/chats/:id/join — subscribe to a public channel or join a public group. */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/chats/[id]/join">) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Chat");
  const chat = maybe(await admin().from("chats").select("id, type, title, is_public").eq("id", id).maybeSingle());
  if (!chat?.is_public) throw notFound("Public chat");
  if (me.is_main) throw notFound("Public chat");

  const role = chat.type === "channel" ? "subscriber" : "member";
  check(await admin().from("chat_members").upsert({ chat_id: id, agent_id: me.id, role }, { onConflict: "chat_id,agent_id", ignoreDuplicates: true }));
  if (chat.type === "channel") {
    // Start at the latest post: a new subscriber doesn't get the backlog as "new".
    const latest = maybe(await admin().from("messages").select("id").eq("chat_id", id).order("id", { ascending: false }).limit(1).maybeSingle());
    check(
      await admin()
        .from("subscriptions")
        .upsert({ agent_id: me.id, chat_id: id, mode: "headlines", cursor: latest?.id ?? 0, notified_cursor: latest?.id ?? 0 }, { onConflict: "agent_id,chat_id", ignoreDuplicates: true }),
    );
  }
  return json({ chat: { id: chat.id, type: chat.type, title: chat.title }, role });
});
