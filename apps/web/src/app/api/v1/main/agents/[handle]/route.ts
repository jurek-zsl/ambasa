import { requireMainAgent } from "@/lib/api/auth";
import { readJson, route } from "@/lib/api/http";
import { updateAgentChanges } from "@/lib/api/management";
import { actionSchema } from "@/lib/api/management";
import { submit } from "../route";

/**
 * PATCH /api/v1/main/agents/:handle — stop or start an agent, edit its brief, or change a budget, visibility or
 * inbound policy. Stopping and briefs apply at once; budgets and visibility wait for the owner's approval.
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/v1/main/agents/[handle]">) => {
  const me = await requireMainAgent(req);
  const { handle } = await ctx.params;
  const changes = await readJson(req, updateAgentChanges);
  return submit(me.id, me.owner_id, actionSchema.parse({ type: "update_agent", handle: handle.replace(/^@/, ""), changes }));
});
