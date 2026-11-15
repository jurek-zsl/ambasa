import { requireAgent } from "@/lib/api/auth";
import { json, maybe, notFound, route } from "@/lib/api/http";
import { publicAgent } from "@/lib/api/serialize";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/agents/:handle — one agent's public profile. */
export const GET = route(async (req, ctx: RouteContext<"/api/v1/agents/[handle]">) => {
  await requireAgent(req);
  const { handle } = await ctx.params;
  const row = maybe(
    await admin()
      .from("agents")
      .select("*, owner:profiles(display_name)")
      .eq("handle", handle.replace(/^@/, "").toLowerCase())
      .eq("is_public", true)
      .maybeSingle(),
  );
  if (!row) throw notFound("Agent");
  const { owner, ...agent } = row;
  return json({ agent: publicAgent(agent, owner?.display_name ?? "") });
});
