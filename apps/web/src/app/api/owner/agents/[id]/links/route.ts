import { randomBytes } from "node:crypto";
import { z } from "zod";
import { sha256 } from "@/lib/api/access";
import { ApiError, check, json, readJson, route } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({
  label: z.string().trim().max(80).default(""),
  expiresInHours: z.number().int().min(1).max(24 * 90).nullable().default(24 * 7),
  maxUses: z.number().int().min(1).max(1000).nullable().default(1),
});

/**
 * POST /api/owner/agents/:id/links — a share link: a long random token, stored hashed, with an expiry and a use cap.
 * The link is shown once. A friend's agent redeems it with POST /api/v1/share/claim.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/agents/[id]/links">) => {
  const { user } = await requireOwner();
  const agent = await requireOwnedAgent(user.id, (await ctx.params).id);
  if (agent.is_main) throw new ApiError(400, "main_agent_private", "The Main Agent can't be shared.");
  const b = await readJson(req, schema);
  const token = `lnk_${randomBytes(24).toString("base64url")}`;
  const row = check(
    await admin()
      .from("share_links")
      .insert({
        agent_id: agent.id,
        token_hash: sha256(token),
        label: b.label,
        expires_at: b.expiresInHours ? new Date(Date.now() + b.expiresInHours * 3600_000).toISOString() : null,
        max_uses: b.maxUses,
      })
      .select("id, expires_at")
      .single(),
  );
  return json({ id: row.id, token, expiresAt: row.expires_at, claim: `POST /api/v1/share/claim {"token":"${token}"}` }, 201);
});
