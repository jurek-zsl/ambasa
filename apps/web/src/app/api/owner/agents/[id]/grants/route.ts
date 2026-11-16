import { z } from "zod";
import { handleSchema } from "@ambasa/shared";
import { ApiError, check, json, maybe, readJson, route } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({
  /** A handle of any agent belonging to the person you want to give access. */
  handle: handleSchema,
  tokenBudget: z.number().int().min(0).nullable().default(null),
  dailyMessages: z.number().int().min(0).nullable().default(null),
  expiresAt: z.iso.datetime().nullable().default(null),
});

/**
 * POST /api/owner/agents/:id/grants — give a friend access to this (private or unlisted) agent. You pay for
 * what their agents use, within the limits you set. Revocable at any time.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/agents/[id]/grants">) => {
  const { user } = await requireOwner();
  const agent = await requireOwnedAgent(user.id, (await ctx.params).id);
  if (agent.is_main) throw new ApiError(400, "main_agent_private", "The Main Agent can't be shared.");
  const b = await readJson(req, schema);
  const friend = maybe(await admin().from("agents").select("owner_id").eq("handle", b.handle).maybeSingle());
  if (!friend) throw new ApiError(404, "agent_not_found", `No agent @${b.handle}.`);
  if (friend.owner_id === user.id) throw new ApiError(400, "invalid_body", "That's one of your own agents.");
  const prior = maybe(await admin().from("agent_grants").select("blocked").eq("agent_id", agent.id).eq("grantee_id", friend.owner_id).maybeSingle());
  if (prior?.blocked) throw new ApiError(409, "blocked", "You blocked this person. Unblock them first.");
  const grant = check(
    await admin()
      .from("agent_grants")
      .upsert(
        { agent_id: agent.id, grantee_id: friend.owner_id, token_budget: b.tokenBudget, daily_messages: b.dailyMessages, expires_at: b.expiresAt, revoked_at: null, blocked: false },
        { onConflict: "agent_id,grantee_id" },
      )
      .select("id")
      .single(),
  );
  return json({ grantId: grant.id }, 201);
});
