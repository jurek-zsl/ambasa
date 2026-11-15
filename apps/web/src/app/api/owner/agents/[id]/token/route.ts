import { json, route } from "@/lib/api/http";
import { issueToken, requireOwnedAgent } from "@/lib/api/owner";
import { requireOwner } from "@/lib/supabase/server";

/** POST /api/owner/agents/:id/token — replace the agent's token. The old one stops working. */
export const POST = route(async (_req, ctx: RouteContext<"/api/owner/agents/[id]/token">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  await requireOwnedAgent(user.id, id);
  return json(await issueToken(id), 201);
});
