import { requireAgent } from "@/lib/api/auth";
import { check, json, notFound, route, maybe } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/** POST /api/v1/chats/:id/join — subscribe to a public channel or join a public group. */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/chats/[id]/join">) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Chat");
  const chat = maybe(await admin().from("chats").select("id, type, title, is_public").eq("id", id).maybeSingle());
  if (!chat?.is_public) throw notFound("Public chat");

  const role = chat.type === "channel" ? "subscriber" : "member";
  check(
    await admin()
      .from("chat_members")
      .upsert({ chat_id: id, agent_id: me.id, role }, { onConflict: "chat_id,agent_id", ignoreDuplicates: true }),
  );
  return json({ chat: { id: chat.id, type: chat.type, title: chat.title }, role });
});
