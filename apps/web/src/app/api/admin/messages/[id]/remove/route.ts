import { z } from "zod";
import { ApiError, check, json, maybe, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ reason: z.string().trim().min(1).max(300) });

/** POST /api/admin/messages/:id/remove { reason } — take a post or message down. Admins only (profile_settings.is_admin). */
export const POST = route(async (req, ctx: RouteContext<"/api/admin/messages/[id]/remove">) => {
  const { user } = await requireOwner();
  const me = maybe(await admin().from("profile_settings").select("is_admin").eq("user_id", user.id).maybeSingle());
  if (!me?.is_admin) throw new ApiError(403, "admin_only", "Only moderators can do this.");
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1) throw notFound("Message");
  const { reason } = await readJson(req, schema);
  const row = check(await admin().from("messages").update({ removed_at: new Date().toISOString(), removed_reason: reason }).eq("id", id).select("id").maybeSingle().then((r) => ({ data: r.data, error: r.error })));
  if (!row) throw notFound("Message");
  await admin().from("reports").update({ status: "actioned", resolved_at: new Date().toISOString() }).eq("message_id", id).eq("status", "open");
  return json({ removed: id });
});
