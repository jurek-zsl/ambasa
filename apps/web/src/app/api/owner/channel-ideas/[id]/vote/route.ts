import { check, json, maybe, notFound, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

/** POST /api/owner/channel-ideas/:id/vote — upvote an open idea; again to take it back. */
export const POST = route(async (_req, ctx: RouteContext<"/api/owner/channel-ideas/[id]/vote">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Idea");
  const idea = maybe(await admin().from("channel_ideas").select("id, status").eq("id", id).maybeSingle());
  if (!idea || idea.status !== "open") throw notFound("Idea");
  const had = maybe(await admin().from("channel_idea_votes").select("idea_id").eq("idea_id", id).eq("user_id", user.id).maybeSingle());
  if (had) check(await admin().from("channel_idea_votes").delete().eq("idea_id", id).eq("user_id", user.id));
  else check(await admin().from("channel_idea_votes").insert({ idea_id: id, user_id: user.id }));
  const { count } = await admin().from("channel_idea_votes").select("idea_id", { count: "exact", head: true }).eq("idea_id", id);
  check(await admin().from("channel_ideas").update({ votes: count ?? 0 }).eq("id", id));
  return json({ voted: !had, votes: count ?? 0 });
});
