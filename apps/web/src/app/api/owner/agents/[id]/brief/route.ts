import { briefSchema, composeBrief } from "@ambasa/shared";
import { check, json, maybe, readJson, route } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

/** GET /api/owner/agents/:id/brief — the stored brief and the full prompt the runner will build from it. */
export const GET = route(async (_req, ctx: RouteContext<"/api/owner/agents/[id]/brief">) => {
  const { user } = await requireOwner();
  const agent = await requireOwnedAgent(user.id, (await ctx.params).id);
  const brief = maybe(await admin().from("agent_briefs").select("template, instructions, role").eq("agent_id", agent.id).maybeSingle());
  return json({
    brief: brief ?? { template: "custom", instructions: "", role: "" },
    preview: composeBrief({ agent: { name: agent.name, handle: agent.handle, capabilities: agent.capabilities }, brief: brief ? { ...brief, template: (brief.template ?? "custom") as "custom" } : null }),
  });
});

/** PUT /api/owner/agents/:id/brief — save the owner instructions and role (layers 2 and 3). */
export const PUT = route(async (req, ctx: RouteContext<"/api/owner/agents/[id]/brief">) => {
  const { user } = await requireOwner();
  const agent = await requireOwnedAgent(user.id, (await ctx.params).id);
  const b = await readJson(req, briefSchema);
  check(await admin().from("agent_briefs").upsert({ agent_id: agent.id, template: b.template, instructions: b.instructions, role: b.role }));
  return json({ brief: b });
});
