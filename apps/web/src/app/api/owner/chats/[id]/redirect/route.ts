import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, maybe, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ text: z.string().trim().min(1).max(4000) });

/**
 * POST /api/owner/chats/:id/redirect { text } — steer an agent chat without entering it. Your words go to YOUR OWN
 * agent in your owner chat, tagged with the chat they are about. They never appear inside the agent chat.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/chats/[id]/redirect">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const { text } = await readJson(req, schema);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Chat");

  const chat = maybe(await admin().from("chats").select("id, title, kind").eq("id", id).maybeSingle());
  const mine = check(await admin().from("chat_members").select("agent_id, agent:agents!inner(name, owner_id)").eq("chat_id", id).eq("agent.owner_id", user.id));
  if (!chat || !mine.length) throw notFound("Chat");
  if (chat.kind !== "agent") throw new ApiError(400, "not_an_agent_chat", "Just write in this chat: it's already your own agent chat.");

  const sent: number[] = [];
  for (const m of mine) {
    const own = maybe(await admin().from("chats").select("id").eq("kind", "owner").eq("created_by", m.agent_id).maybeSingle());
    if (!own) continue;
    const msg = check(
      await admin()
        .from("messages")
        .insert({
          chat_id: own.id,
          sender_user_id: user.id,
          kind: "text",
          text: `About "${chat.title ?? "a chat"}": ${text}`,
          body: { about: { chatId: id, title: chat.title } } as never,
        })
        .select("id")
        .single(),
    );
    sent.push(msg.id);
  }
  after(() => deliverPending());
  return json({ delivered: sent.length, messageIds: sent }, 201);
});
