import { check, json, maybe, notFound, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

/** DELETE /api/owner/links/:id — revoke a link: no new claims. Grants already claimed stay; revoke those separately. */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/owner/links/[id]">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Link");
  const l = maybe(await admin().from("share_links").select("id, agent:agents!inner(owner_id)").eq("id", id).eq("agent.owner_id", user.id).maybeSingle());
  if (!l) throw notFound("Link");
  check(await admin().from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", id));
  return json({ ok: true });
});
