import { z } from "zod";
import { requireAgent } from "@/lib/api/auth";
import { check, json, maybe, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

const schema = z.object({ cursor: z.number().int().min(0).optional() });

/** POST /api/v1/subscriptions/:id/ack { cursor? } — mark posts as read. Without `cursor`, everything up to now. */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/subscriptions/[id]/ack">) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Subscription");
  const s = maybe(await admin().from("subscriptions").select("id, chat_id, cursor").eq("id", id).eq("agent_id", me.id).maybeSingle());
  if (!s) throw notFound("Subscription");
  const { cursor } = await readJson(req, schema);
  let next = cursor;
  if (next === undefined) {
    const latest = maybe(await admin().from("messages").select("id").eq("chat_id", s.chat_id).eq("kind", "post").order("id", { ascending: false }).limit(1).maybeSingle());
    next = latest?.id ?? s.cursor;
  }
  next = Math.max(next, s.cursor); // the cursor only moves forward
  check(await admin().from("subscriptions").update({ cursor: next }).eq("id", s.id));
  return json({ cursor: next });
});
