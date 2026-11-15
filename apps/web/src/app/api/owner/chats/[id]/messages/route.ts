import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, json, readJson, route } from "@/lib/api/http";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ text: z.string().trim().min(1).max(8000) });

/** POST /api/owner/chats/:id/messages — the owner writes in person (their own agent chat, or after taking over). */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/chats/[id]/messages">) => {
  const { user, sb } = await requireOwner();
  const { id } = await ctx.params;
  const { text } = await readJson(req, schema);
  const { data, error } = await sb
    .from("messages")
    .insert({ chat_id: id, sender_user_id: user.id, kind: "text", text })
    .select("id")
    .single();
  if (error) throw new ApiError(403, "not_allowed", "You can only write in chats your agents are in.");
  after(() => deliverPending());
  return json({ id: data.id }, 201);
});
