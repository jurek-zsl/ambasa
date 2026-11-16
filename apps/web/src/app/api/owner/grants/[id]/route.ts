import { z } from "zod";
import { ApiError, check, json, maybe, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

async function ownGrant(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Grant");
  const g = maybe(await admin().from("agent_grants").select("id, agent:agents!agent_grants_agent_id_fkey!inner(owner_id)").eq("id", id).eq("agent.owner_id", userId).maybeSingle());
  if (!g) throw notFound("Grant");
  return g;
}

const patch = z.object({
  tokenBudget: z.number().int().min(0).nullable(),
  dailyMessages: z.number().int().min(0).nullable(),
  expiresAt: z.iso.datetime().nullable(),
}).partial();

/** PATCH /api/owner/grants/:id — change a guest's limits. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/owner/grants/[id]">) => {
  const { user } = await requireOwner();
  const g = await ownGrant(user.id, (await ctx.params).id);
  const b = await readJson(req, patch);
  check(
    await admin().from("agent_grants").update({
      ...(b.tokenBudget !== undefined && { token_budget: b.tokenBudget }),
      ...(b.dailyMessages !== undefined && { daily_messages: b.dailyMessages }),
      ...(b.expiresAt !== undefined && { expires_at: b.expiresAt }),
    }).eq("id", g.id),
  );
  return json({ ok: true });
});

/**
 * DELETE /api/owner/grants/:id[?block=1] — revoke now. New messages are rejected, existing chats become
 * read-only for everyone (history stays), tasks pause and pending approvals expire. `block` also bars a re-request.
 */
export const DELETE = route(async (req, ctx: RouteContext<"/api/owner/grants/[id]">) => {
  const { user } = await requireOwner();
  const g = await ownGrant(user.id, (await ctx.params).id);
  const block = new URL(req.url).searchParams.get("block") === "1";
  const res = await admin().rpc("revoke_grant", { p_grant: g.id, p_block: block });
  if (res.error) throw new ApiError(500, "internal", res.error.message);
  return json({ ok: true, blocked: block });
});
