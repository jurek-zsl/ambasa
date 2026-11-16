import { timingSafeEqual } from "node:crypto";
import type { Database } from "@ambasa/shared";
import { admin } from "../supabase/admin";
import { ApiError, maybe } from "./http";
import { hashToken } from "./tokens";

export type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
export type AuthedAgent = AgentRow & { ownerName: string; scope: "agent" | "main" };

/**
 * The hosted worker acts for agents it runs without ever holding their tokens: it sends `X-Worker-Secret` (a shared
 * secret from the environment) and `X-Act-As: <agent id>`. Only agents set to `hosted` can be acted for this way.
 */
async function workerActAs(req: Request): Promise<AuthedAgent | null> {
  const secret = process.env.WORKER_SECRET;
  const given = req.headers.get("x-worker-secret");
  const id = req.headers.get("x-act-as");
  if (!secret || !given || !id) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await admin().from("agents").select("*, owner:profiles(display_name)").eq("id", id).eq("hosting", "hosted").maybeSingle();
  const row = maybe(res);
  if (!row) return null;
  const { owner, ...agent } = row;
  return { ...agent, ownerName: owner?.display_name ?? "", scope: agent.is_main ? "main" : "agent" };
}

/** Resolves `Authorization: Bearer <token>` to the agent that owns the token. */
export async function requireAgent(req: Request): Promise<AuthedAgent> {
  const acting = await workerActAs(req);
  if (acting) return acting;
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "missing_token", "Send your agent token as: Authorization: Bearer ag_live_…", undefined, "Create an agent in the dashboard and copy its token.");
  }
  const res = await admin()
    .from("agent_credentials")
    .select("agent_id, scope, last_used_at, agent:agents(*, owner:profiles(display_name))")
    .eq("token_hash", hashToken(match[1]))
    .maybeSingle();
  const cred = maybe(res);
  if (!cred?.agent) {
    throw new ApiError(401, "invalid_token", "This token isn't valid.", undefined, "Ask the agent's owner to rotate its token in the dashboard.");
  }

  // Touch last_used_at at most every 5 minutes.
  const last = cred.last_used_at ? Date.parse(cred.last_used_at) : 0;
  if (Date.now() - last > 5 * 60_000) {
    await admin().from("agent_credentials").update({ last_used_at: new Date().toISOString() }).eq("agent_id", cred.agent_id);
  }

  const { owner, ...agent } = cred.agent;
  return { ...agent, ownerName: owner?.display_name ?? "", scope: cred.scope as "agent" | "main" };
}

/** The Main Agent's scoped token. Normal agent tokens can't call management endpoints. */
export async function requireMainAgent(req: Request): Promise<AuthedAgent> {
  const me = await requireAgent(req);
  if (me.scope !== "main" || !me.is_main) {
    throw new ApiError(403, "main_agent_only", "Only the Main Agent can do this.", undefined, "Use the token that starts with ag_main_.");
  }
  return me;
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
    throw new ApiError(429, "rate_limited", `Slow down: at most ${limit} messages per minute for this agent.`, { "Retry-After": "60" }, "Wait a minute, then retry.");
  }
}
