import { z } from "zod";
import type { Database } from "@ambasa/shared";
import {
  agentProfileSchema,
  briefSchema,
  handleSchema,
  INBOUND_POLICIES,
  VISIBILITIES,
} from "@ambasa/shared";
import { admin } from "../supabase/admin";
import { ApiError, check, maybe } from "./http";
import { createAgent, limitError } from "./owner";

/**
 * What the Main Agent may ask to do. Each action waits for the owner's approval unless the owner turned on
 * auto-approve in settings. The database refuses anything that would break the owner's budget or agent limit.
 */
export const createAgentParams = agentProfileSchema.extend({
  brief: briefSchema.partial().optional(),
});
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
  z.object({
    type: z.literal("delegate_task"),
    handle: handleSchema,
    goal: z.string().trim().min(3).max(6000),
  }),
  z.object({ type: z.literal("create_agent"), params: createAgentParams }),
  z.object({
    type: z.literal("update_agent"),
    handle: handleSchema,
    changes: updateAgentChanges,
  }),
]);
export type ManagementAction = z.infer<typeof actionSchema>;

/** Stopping or starting an agent, or editing its brief, is safe; budgets and who can reach it are not. */
export function needsApproval(action: ManagementAction): boolean {
  if (action.type === "create_agent" || action.type === "delegate_task")
    return true;
  const c = action.changes;
  return [
    "visibility",
    "inboundPolicy",
    "dailyMessageCap",
    "dailyTokenCap",
    "maxToolSteps",
    "coldContactCap",
  ].some((k) => k in c);
}

export async function describe(
  action: ManagementAction,
  ownerId: string,
): Promise<{ title: string; fields: Record<string, string> }> {
  if (action.type === "delegate_task")
    return {
      title: `Delegate a task to @${action.handle}`,
      fields: {
        goal: action.goal,
        scope: "Private task instruction to your specialist",
      },
    };
  if (action.type === "create_agent") {
    const p = action.params;
    return {
      title: `Create agent @${p.handle}`,
      fields: {
        name: p.name,
        visibility: p.visibility,
        "daily token budget": String(p.dailyTokenCap),
        hosting: p.hosting,
        ...(p.hosting === "hosted"
          ? {
              "model connection":
                "Reuse your Main Agent’s connection, when configured",
            }
          : {}),
        role: p.brief?.role?.slice(0, 120) ?? p.bio.slice(0, 120),
      },
    };
  }
  const fields: Record<string, string> = {};
  const current = maybe(
    await admin()
      .from("agents")
      .select(
        "daily_token_cap,daily_message_cap,max_tool_steps,cold_contact_cap,visibility,inbound_policy",
      )
      .eq("owner_id", ownerId)
      .eq("handle", action.handle)
      .maybeSingle(),
  );
  const names: Record<string, string> = {
    dailyTokenCap: "Daily token limit",
    dailyMessageCap: "Daily message limit",
    maxToolSteps: "Tool steps per turn",
    coldContactCap: "New contacts per day",
    visibility: "Visibility",
    inboundPolicy: "Who may contact it",
  };
  const old: Record<string, unknown> = current
    ? {
        dailyTokenCap: current.daily_token_cap,
        dailyMessageCap: current.daily_message_cap,
        maxToolSteps: current.max_tool_steps,
        coldContactCap: current.cold_contact_cap,
        visibility: current.visibility,
        inboundPolicy: current.inbound_policy,
      }
    : {};
  const format = (v: unknown) =>
    typeof v === "number"
      ? v.toLocaleString("en-US")
      : typeof v === "object"
        ? "updated"
        : String(v);
  for (const [k, v] of Object.entries(action.changes))
    fields[names[k] ?? k] =
      k in old ? `${format(old[k])} → ${format(v)}` : format(v);
  return { title: `Change @${action.handle}`, fields };
}

export async function execute(
  ownerId: string,
  action: ManagementAction,
  context?: { approvalId: string },
): Promise<{ handle: string; summary: string }> {
  if (action.type === "delegate_task") {
    const target = maybe(
      await admin()
        .from("agents")
        .select("id,is_main,paused")
        .eq("owner_id", ownerId)
        .eq("handle", action.handle)
        .maybeSingle(),
    );
    if (!target || target.is_main)
      throw new ApiError(
        404,
        "agent_not_found",
        "Choose one of your specialist agents.",
      );
    if (target.paused)
      throw new ApiError(
        409,
        "agent_stopped",
        "Start the specialist before delegating.",
      );
    const chat = check(
      await admin()
        .from("chats")
        .select("id")
        .eq("kind", "owner")
        .eq("created_by", target.id)
        .single(),
    );
    check(
      await admin()
        .from("messages")
        .insert({
          chat_id: chat.id,
          kind: "system",
          text: `Owner-authorized delegation from your Main Agent: ${action.goal}`,
          body: {
            owner_delegation: true,
            goal: action.goal,
            ...(context ? { approval_id: context.approvalId } : {}),
          },
          expects_reply: true,
        }),
    );
    return {
      handle: action.handle,
      summary: `Delegated to @${action.handle}. Execution and any further approvals happen in its task.`,
    };
  }
  if (action.type === "create_agent") {
    const { brief, ...profile } = action.params;
    const made = await createAgent(ownerId, profile, { brief });
    if (profile.hosting === "hosted") {
      const main = maybe(
        await admin()
          .from("agents")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("is_main", true)
          .maybeSingle(),
      );
      const key = main
        ? maybe(
            await admin()
              .from("agent_secrets")
              .select("provider,model,base_url,ciphertext,hint")
              .eq("agent_id", main.id)
              .maybeSingle(),
          )
        : null;
      if (key) {
        check(
          await admin()
            .from("agent_secrets")
            .insert({ ...key, agent_id: made.agent.id }),
        );
        check(
          await admin()
            .from("agents")
            .update({ model: key.model })
            .eq("id", made.agent.id),
        );
      }
    }
    return {
      handle: made.agent.handle,
      summary: `Created @${made.agent.handle}`,
    };
  }
  const agent = maybe(
    await admin()
      .from("agents")
      .select("id, is_main")
      .eq("handle", action.handle)
      .eq("owner_id", ownerId)
      .maybeSingle(),
  );
  if (!agent)
    throw new ApiError(
      404,
      "agent_not_found",
      `No agent @${action.handle} among yours.`,
    );
  const c = action.changes;
  const update: Database["public"]["Tables"]["agents"]["Update"] = {};
  if (c.name !== undefined) update.name = c.name;
  if (c.bio !== undefined) update.bio = c.bio;
  if (c.visibility !== undefined) update.visibility = c.visibility;
  if (c.inboundPolicy !== undefined) update.inbound_policy = c.inboundPolicy;
  if (c.dailyMessageCap !== undefined)
    update.daily_message_cap = c.dailyMessageCap;
  if (c.dailyTokenCap !== undefined) update.daily_token_cap = c.dailyTokenCap;
  if (c.maxToolSteps !== undefined) update.max_tool_steps = c.maxToolSteps;
  if (c.coldContactCap !== undefined)
    update.cold_contact_cap = c.coldContactCap;
  if (c.stopped !== undefined) update.paused = c.stopped;
  if (Object.keys(update).length) {
    const res = await admin().from("agents").update(update).eq("id", agent.id);
    const le = limitError(res.error);
    if (le) throw le;
    check(res);
  }
  if (c.brief) {
    const existing = maybe(
      await admin()
        .from("agent_briefs")
        .select("template, instructions, role")
        .eq("agent_id", agent.id)
        .maybeSingle(),
    );
    check(
      await admin()
        .from("agent_briefs")
        .upsert({
          agent_id: agent.id,
          template: c.brief.template ?? existing?.template ?? "custom",
          instructions: c.brief.instructions ?? existing?.instructions ?? "",
          role: c.brief.role ?? existing?.role ?? "",
        }),
    );
  }
  return { handle: action.handle, summary: `Updated @${action.handle}` };
}
