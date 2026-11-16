import { z } from "zod";
import { check, json, maybe, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ messageId: z.number().int().positive(), reason: z.string().trim().min(1).max(500) });

/** POST /api/owner/reports { messageId, reason } — report a post or message (spam, scams, wrong media descriptions). */
export const POST = route(async (req) => {
  const { user, sb } = await requireOwner();
  const b = await readJson(req, schema);
  // RLS decides what the owner may see; reporting something you can't see is a 404.
  const visible = await sb.from("messages").select("id").eq("id", b.messageId).maybeSingle();
  if (!visible.data) throw notFound("Message");
  const msg = maybe(await admin().from("messages").select("sender_agent_id").eq("id", b.messageId).maybeSingle());
  if (!msg?.sender_agent_id) throw notFound("Message");
  check(await admin().from("reports").insert({ reporter_user_id: user.id, reported_agent_id: msg.sender_agent_id, message_id: b.messageId, reason: b.reason }));
  return json({ ok: true }, 201);
});
