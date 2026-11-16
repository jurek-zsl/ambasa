import { z } from "zod";
import { sha256 } from "@/lib/api/access";
import { requireAgent } from "@/lib/api/auth";
import { ApiError, check, json, maybe, readJson, route } from "@/lib/api/http";
import { notifyOwner } from "@/lib/api/notify";
import { admin } from "@/lib/supabase/admin";
import { after } from "next/server";

const schema = z.object({ token: z.string().min(20).max(200) });

/**
 * POST /api/v1/share/claim { token } — a friend's agent uses a share link to get access to an unlisted or
 * private agent. The grant belongs to the friend (all their agents can use it); the connecting agent is recorded.
 */
export const POST = route(async (req) => {
  const me = await requireAgent(req);
  const { token } = await readJson(req, schema);
  const bad = new ApiError(404, "link_invalid", "This link doesn't work.", undefined, "Ask the owner for a new one.");
  const link = maybe(
    await admin().from("share_links").select("id, agent_id, expires_at, max_uses, uses, revoked_at, agent:agents(id, handle, name, owner_id)").eq("token_hash", sha256(token)).maybeSingle(),
  );
  if (!link?.agent || link.revoked_at) throw bad;
  if (link.expires_at && Date.parse(link.expires_at) < Date.now()) throw bad;
  if (link.max_uses !== null && link.uses >= link.max_uses) throw bad;
  if (link.agent.owner_id === me.owner_id) throw new ApiError(400, "own_agent", "That's one of your own agents.");

  const existing = maybe(await admin().from("agent_grants").select("id, blocked, revoked_at").eq("agent_id", link.agent_id).eq("grantee_id", me.owner_id).maybeSingle());
  if (existing?.blocked) throw bad; // blocked means no re-request
  if (existing && !existing.revoked_at) return json({ agent: { handle: link.agent.handle, name: link.agent.name }, grantId: existing.id, already: true });

  const grant = check(
    await admin()
      .from("agent_grants")
      .upsert(
        { agent_id: link.agent_id, grantee_id: me.owner_id, via_link: link.id, connecting_agent_id: me.id, revoked_at: null, blocked: false, messages_used: 0, tokens_used: 0, messages_today: 0 },
        { onConflict: "agent_id,grantee_id" },
      )
      .select("id")
      .single(),
  );
  await admin().from("share_links").update({ uses: link.uses + 1 }).eq("id", link.id);
  after(() => notifyOwner(link.agent!.owner_id, `${me.ownerName || "Someone"}'s agent @${me.handle} joined ${link.agent!.name} through your link.`, "/app"));
  return json({ agent: { handle: link.agent.handle, name: link.agent.name }, grantId: grant.id }, 201);
});
