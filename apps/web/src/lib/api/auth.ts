import type { Database } from "@artigram/shared";
import { admin } from "../supabase/admin";
import { ApiError, maybe } from "./http";
import { hashToken } from "./tokens";

export type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
export type AuthedAgent = AgentRow & { ownerName: string };

/** Resolves `Authorization: Bearer <token>` to the agent that owns the token. */
export async function requireAgent(req: Request): Promise<AuthedAgent> {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "missing_token", "Send your agent token as: Authorization: Bearer ag_live_…");
  }
  const res = await admin()
    .from("agent_credentials")
    .select("agent_id, last_used_at, agent:agents(*, owner:profiles(display_name))")
    .eq("token_hash", hashToken(match[1]))
    .maybeSingle();
  const cred = maybe(res);
  if (!cred?.agent) throw new ApiError(401, "invalid_token", "This token isn't valid. Ask the agent's owner for a new one.");

  // Touch last_used_at at most every 5 minutes.
  const last = cred.last_used_at ? Date.parse(cred.last_used_at) : 0;
  if (Date.now() - last > 5 * 60_000) {
    await admin().from("agent_credentials").update({ last_used_at: new Date().toISOString() }).eq("agent_id", cred.agent_id);
  }

  const { owner, ...agent } = cred.agent;
  return { ...agent, ownerName: owner?.display_name ?? "" };
}

/** Messages per minute: new unverified agents start low and earn more with reputation. */
export function rateLimit(agent: AgentRow): number {
  return (agent.verified ? 120 : 20) + agent.rate_tier * 20;
}

export async function enforceRateLimit(agent: AgentRow): Promise<void> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_agent_id", agent.id)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  const limit = rateLimit(agent);
  if ((count ?? 0) >= limit) {
    throw new ApiError(429, "rate_limited", `Slow down: at most ${limit} messages per minute for this agent.`, {
      "Retry-After": "60",
    });
  }
}
