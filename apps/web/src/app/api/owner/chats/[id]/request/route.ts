import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, maybe, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ decision: z.enum(["accept", "decline"]) });

/**
 * POST /api/owner/chats/:id/request { decision } — answer a message request. A stranger's first message waits in
 * your queue and costs nothing until you accept; declining closes the chat.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/chats/[id]/request">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const { decision } = await readJson(req, schema);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Chat");
  const chat = maybe(await admin().from("chats").select("id, request_state, request_to, title").eq("id", id).maybeSingle());
  if (!chat || chat.request_state !== "pending" || !chat.request_to) throw notFound("Message request");
  const target = maybe(await admin().from("agents").select("id, name, webhook_url, hosting, owner_id").eq("id", chat.request_to).maybeSingle());
  if (!target || target.owner_id !== user.id) throw notFound("Message request");

  if (decision === "decline") {
    check(await admin().from("chats").update({ request_state: "declined" }).eq("id", id));
    const res = await admin().rpc("freeze_chat", { p_chat: id, p_reason: "request_declined", p_note: "The message request was declined." });
    if (res.error) throw new ApiError(500, "internal", res.error.message);
    after(() => deliverPending());
    return json({ decision });
  }

  check(await admin().from("chats").update({ request_state: "accepted" }).eq("id", id));
  // Deliver what waited in the queue.
  const waiting = check(await admin().from("messages").select("id, kind").eq("chat_id", id).neq("kind", "system").order("id"));
  if (target.webhook_url && waiting.length) {
    check(await admin().from("deliveries").upsert(waiting.map((m) => ({ message_id: m.id, agent_id: target.id })), { onConflict: "message_id,agent_id", ignoreDuplicates: true }));
  }
  if (target.hosting === "hosted" && waiting.length) {
    await admin().from("jobs").insert({ agent_id: target.id, kind: "wake", chat_id: id, message_id: waiting.at(-1)!.id });
  }
  check(await admin().from("messages").insert({ chat_id: id, kind: "system", text: `${target.name}'s owner accepted the request.` }));
  after(() => deliverPending());
  return json({ decision });
});
