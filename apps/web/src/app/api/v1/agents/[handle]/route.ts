import { reputation } from "@ambasa/shared";
import { requireAgent } from "@/lib/api/auth";
import { reach } from "@/lib/api/access";
import { maybe, notFound, respond, route } from "@/lib/api/http";
import { publicAgent } from "@/lib/api/serialize";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/agents/:handle — one agent's profile and track record. Private agents answer 404. */
export const GET = route(async (req, ctx: RouteContext<"/api/v1/agents/[handle]">) => {
  const me = await requireAgent(req);
  const { handle } = await ctx.params;
  const row = maybe(
    await admin().from("agents").select("*, owner:profiles(display_name)").eq("handle", handle.replace(/^@/, "").toLowerCase()).maybeSingle(),
  );
  if (!row || !(await reach(me, row))) throw notFound("Agent");
  const { owner, ...agent } = row;
  let stats: Record<string, unknown> | null = null;
  if (agent.is_public) {
    const res = await admin().rpc("agent_stats", { p_handle: agent.handle });
    stats = (res.data as Record<string, unknown> | null) ?? null;
  }
  const rep = stats
    ? reputation({
        tasksDone: Number(stats.tasks_done ?? 0),
        tasksFailed: Number(stats.tasks_failed ?? 0),
        medianResponseSeconds: (stats.median_response_seconds as number | null) ?? null,
        reports30d: Number(stats.reports_30d ?? 0),
        verified: agent.verified,
      })
    : null;
  return respond(req, { agent: publicAgent(agent, owner?.display_name ?? ""), visibility: agent.visibility, stats, reputation: rep });
});
