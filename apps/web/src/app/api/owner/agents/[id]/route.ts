import { z } from "zod";
import { HOSTING_MODES, INBOUND_POLICIES, VISIBILITIES, guestPolicySchema } from "@ambasa/shared";
import { check, json, readJson, route } from "@/lib/api/http";
import { limitError, requireOwnedAgent } from "@/lib/api/owner";
import { webhookUrlProblem } from "@/lib/api/webhook-url";
import { ApiError } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z
  .object({
    name: z.string().trim().min(1).max(64),
    bio: z.string().max(500),
    visibility: z.enum(VISIBILITIES),
    inboundPolicy: z.enum(INBOUND_POLICIES),
    hosting: z.enum(HOSTING_MODES),
    webhookUrl: z.url({ protocol: /^https?$/ }).nullable(),
    stopped: z.boolean(),
    dailyMessageCap: z.number().int().min(0).max(100_000),
    dailyTokenCap: z.number().int().min(0).max(100_000_000),
    maxToolSteps: z.number().int().min(1).max(50),
    coldContactCap: z.number().int().min(0).max(500),
    guestPolicy: guestPolicySchema,
  })
  .partial();

/** PATCH /api/owner/agents/:id — change visibility, budgets, inbound policy, hosting; stop or start the agent. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/owner/agents/[id]">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const agent = await requireOwnedAgent(user.id, id);
  const c = await readJson(req, schema);
  if (agent.is_main && c.visibility && c.visibility !== "private") throw new ApiError(400, "main_agent_private", "The Main Agent is always private.");
  if (c.webhookUrl) {
    const problem = webhookUrlProblem(c.webhookUrl);
    if (problem) throw new ApiError(400, "invalid_webhook_url", problem);
  }
  const res = await admin()
    .from("agents")
    .update({
      ...(c.name !== undefined && { name: c.name }),
      ...(c.bio !== undefined && { bio: c.bio }),
      ...(c.visibility !== undefined && { visibility: c.visibility }),
      ...(c.inboundPolicy !== undefined && { inbound_policy: c.inboundPolicy }),
      ...(c.hosting !== undefined && { hosting: c.hosting }),
      ...(c.webhookUrl !== undefined && { webhook_url: c.webhookUrl }),
      ...(c.stopped !== undefined && { paused: c.stopped }),
      ...(c.dailyMessageCap !== undefined && { daily_message_cap: c.dailyMessageCap }),
      ...(c.dailyTokenCap !== undefined && { daily_token_cap: c.dailyTokenCap }),
      ...(c.maxToolSteps !== undefined && { max_tool_steps: c.maxToolSteps }),
      ...(c.coldContactCap !== undefined && { cold_contact_cap: c.coldContactCap }),
      ...(c.guestPolicy !== undefined && { guest_policy: c.guestPolicy as never }),
    })
    .eq("id", id)
    .select("*")
    .single();
  const le = limitError(res.error);
  if (le) throw le;
  return json({ agent: check(res) });
});

/** DELETE /api/owner/agents/:id — remove an agent and everything of it. */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/owner/agents/[id]">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const agent = await requireOwnedAgent(user.id, id);
  if (agent.is_main) throw new ApiError(400, "main_agent_required", "The Main Agent can't be deleted.");
  check(await admin().from("agents").delete().eq("id", id));
  return json({ ok: true });
});
