import { z } from "zod";
import type { Database } from "@ambasa/shared";
import { agentProfileSchema, briefSchema, handleSchema, INBOUND_POLICIES, VISIBILITIES } from "@ambasa/shared";
import { admin } from "../supabase/admin";
import { ApiError, check, maybe } from "./http";
import { createAgent, limitError } from "./owner";

/**
 * What the Main Agent may ask to do. Each action waits for the owner's approval unless the owner turned on
 * auto-approve in settings. The database refuses anything that would break the owner's budget or agent limit.
 */
export const createAgentParams = agentProfileSchema.extend({ brief: briefSchema.partial().optional() });
export const updateAgentChanges = z
  .object({
    name: z.string().trim().min(1).max(64),
    bio: z.string().max(500),
    visibility: z.enum(VISIBILITIES),
    inboundPolicy: z.enum(INBOUND_POLICIES),
    dailyMessageCap: z.number().int().min(0).max(100_000),
    dailyTokenCap: z.number().int().min(0).max(100_000_000),
    maxToolSteps: z.number().int().min(1).max(50),
    coldContactCap: z.number().int().min(0).max(500),
    stopped: z.boolean(),
    brief: briefSchema.partial(),
  })
  .partial();

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_agent"), params: createAgentParams }),
  z.object({ type: z.literal("update_agent"), handle: handleSchema, changes: updateAgentChanges }),
]);
export type ManagementAction = z.infer<typeof actionSchema>;

/** Stopping or starting an agent, or editing its brief, is safe; budgets and who can reach it are not. */
export function needsApproval(action: ManagementAction): boolean {
  if (action.type === "create_agent") return true;
  const c = action.changes;
  return ["visibility", "inboundPolicy", "dailyMessageCap", "dailyTokenCap", "maxToolSteps", "coldContactCap"].some((k) => k in c);
}

export function describe(action: ManagementAction): { title: string; fields: Record<string, string> } {
  if (action.type === "create_agent") {
    const p = action.params;
    return {
      title: `Create agent @${p.handle}`,
      fields: { name: p.name, visibility: p.visibility, "daily token budget": String(p.dailyTokenCap), hosting: p.hosting, role: p.brief?.role?.slice(0, 120) ?? p.bio.slice(0, 120) },
    };
  }
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(action.changes)) fields[k] = typeof v === "object" ? "updated" : String(v);
  return { title: `Change @${action.handle}`, fields };
}

export async function execute(ownerId: string, action: ManagementAction): Promise<{ handle: string; summary: string }> {
  if (action.type === "create_agent") {
    const { brief, ...profile } = action.params;
    const made = await createAgent(ownerId, profile, { brief });
    return { handle: made.agent.handle, summary: `Created @${made.agent.handle}` };
  }
  const agent = maybe(await admin().from("agents").select("id, is_main").eq("handle", action.handle).eq("owner_id", ownerId).maybeSingle());
  if (!agent) throw new ApiError(404, "agent_not_found", `No agent @${action.handle} among yours.`);
  const c = action.changes;
  const update: Database["public"]["Tables"]["agents"]["Update"] = {};
  if (c.name !== undefined) update.name = c.name;
  if (c.bio !== undefined) update.bio = c.bio;
  if (c.visibility !== undefined) update.visibility = c.visibility;
  if (c.inboundPolicy !== undefined) update.inbound_policy = c.inboundPolicy;
  if (c.dailyMessageCap !== undefined) update.daily_message_cap = c.dailyMessageCap;
  if (c.dailyTokenCap !== undefined) update.daily_token_cap = c.dailyTokenCap;
  if (c.maxToolSteps !== undefined) update.max_tool_steps = c.maxToolSteps;
  if (c.coldContactCap !== undefined) update.cold_contact_cap = c.coldContactCap;
  if (c.stopped !== undefined) update.paused = c.stopped;
  if (Object.keys(update).length) {
    const res = await admin().from("agents").update(update).eq("id", agent.id);
    const le = limitError(res.error);
    if (le) throw le;
    check(res);
  }
  if (c.brief) {
    const existing = maybe(await admin().from("agent_briefs").select("template, instructions, role").eq("agent_id", agent.id).maybeSingle());
    check(
      await admin().from("agent_briefs").upsert({
        agent_id: agent.id,
        template: c.brief.template ?? existing?.template ?? "custom",
        instructions: c.brief.instructions ?? existing?.instructions ?? "",
        role: c.brief.role ?? existing?.role ?? "",
      }),
    );
  }
  return { handle: action.handle, summary: `Updated @${action.handle}` };
}
