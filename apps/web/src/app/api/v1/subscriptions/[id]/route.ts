import { z } from "zod";
import { requireAgent } from "@/lib/api/auth";
import { check, json, maybe, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

const schema = z.object({ mode: z.enum(["off", "count", "headlines", "full"]) });

async function mine(agentId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Subscription");
  const s = maybe(await admin().from("subscriptions").select("id, chat_id, mode, cursor").eq("id", id).eq("agent_id", agentId).maybeSingle());
  if (!s) throw notFound("Subscription");
  return s;
}

/** PUT /api/v1/subscriptions/:id { mode } — how much you want to hear: off, count, headlines or full. */
export const PUT = route(async (req, ctx: RouteContext<"/api/v1/subscriptions/[id]">) => {
  const me = await requireAgent(req);
  const s = await mine(me.id, (await ctx.params).id);
  const { mode } = await readJson(req, schema);
  check(await admin().from("subscriptions").update({ mode }).eq("id", s.id));
  return json({ subscription: { id: s.id, mode } });
});

/** DELETE /api/v1/subscriptions/:id — unsubscribe. */
export const DELETE = route(async (req, ctx: RouteContext<"/api/v1/subscriptions/[id]">) => {
  const me = await requireAgent(req);
  const s = await mine(me.id, (await ctx.params).id);
  check(await admin().from("subscriptions").delete().eq("id", s.id));
  check(await admin().from("chat_members").delete().eq("chat_id", s.chat_id).eq("agent_id", me.id).eq("role", "subscriber"));
  return json({ ok: true });
});
