import { createHash } from "node:crypto";
import { estimateTokens, type GuestPolicy, type MessageKind } from "@ambasa/shared";
import { admin } from "../supabase/admin";
import type { AgentRow, AuthedAgent } from "./auth";
import { findDm } from "./dm";
import { ApiError, check, maybe, notFound } from "./http";

export type Grant = {
  id: string;
  agent_id: string;
  grantee_id: string;
  token_budget: number | null;
  daily_messages: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  blocked: boolean;
  tokens_used: number;
  messages_today: number;
  usage_day: string;
};

const GRANT_COLUMNS = "id, agent_id, grantee_id, token_budget, daily_messages, expires_at, revoked_at, blocked, tokens_used, messages_today, usage_day";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A grant that is in force: not revoked, not blocked, not expired. */
export function grantActive(g: Pick<Grant, "revoked_at" | "blocked" | "expires_at"> | null | undefined): boolean {
  return !!g && !g.revoked_at && !g.blocked && (!g.expires_at || Date.parse(g.expires_at) > Date.now());
}

export async function findGrant(agentId: string, granteeOwnerId: string): Promise<Grant | null> {
  return maybe(await admin().from("agent_grants").select(GRANT_COLUMNS).eq("agent_id", agentId).eq("grantee_id", granteeOwnerId).maybeSingle()) as Grant | null;
}

export type Reach = "owner" | "grant" | "public";

/**
 * How `me` may reach `target`, or null. Private and unlisted agents answer 404 to outsiders, never 403,
 * so nobody can probe which handles exist.
 */
export async function reach(me: Pick<AgentRow, "owner_id">, target: Pick<AgentRow, "id" | "owner_id" | "visibility">): Promise<{ via: Reach; grant: Grant | null } | null> {
  if (me.owner_id === target.owner_id) return { via: "owner", grant: null };
  const grant = await findGrant(target.id, me.owner_id);
  if (grant?.blocked) return null;
  if (grantActive(grant)) return { via: "grant", grant };
  if (target.visibility === "public") return { via: "public", grant: null };
  return null;
}

/** The inbound policy of a public agent. Returns "request" when the first message must wait for acceptance. */
export async function applyInboundPolicy(me: AuthedAgent, target: Pick<AgentRow, "id" | "handle" | "inbound_policy">): Promise<"ok" | "request"> {
  switch (target.inbound_policy) {
    case "anyone":
      return "ok";
    case "verified":
      if (me.verified) return "ok";
      throw new ApiError(403, "policy_verified_only", `@${target.handle} only accepts verified agents.`, undefined, "Ask your owner to get verified, or message a different agent.");
    case "contacts":
      if (await findDm(me.id, target.id)) return "ok";
      throw new ApiError(403, "policy_contacts_only", `@${target.handle} only accepts contacts.`, undefined, "Ask its owner for a share link.");
    case "requests":
      return (await findDm(me.id, target.id)) ? "ok" : "request";
  }
}

/** New chats this agent started in the last 24 hours (cold contacts). */
export async function newChatsToday(agentId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error } = await admin()
    .from("chats")
    .select("id", { count: "exact", head: true })
    .eq("created_by", agentId)
    .eq("kind", "agent")
    .neq("type", "channel")
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Enforced on every send, not only when a chat is created. For each shareable (non-public) agent in
 * the chat that belongs to someone else, the sender's owner needs an active grant, within its limits
 * and the agent's guest policy. Returns the grants used, so the caller can count the usage.
 */
export async function assertGuestAccess(me: AuthedAgent, chatId: string, kind: MessageKind, textForTokens: string): Promise<Grant[]> {
  const members = check(
    await admin().from("chat_members").select("agent:agents(id, owner_id, visibility, guest_policy, handle)").eq("chat_id", chatId).neq("agent_id", me.id),
  );
  const used: Grant[] = [];
  for (const { agent } of members) {
    if (!agent || agent.owner_id === me.owner_id || agent.visibility === "public") continue;
    const grant = await findGrant(agent.id, me.owner_id);
    if (!grantActive(grant)) {
      throw new ApiError(403, "access_revoked", `Your access to @${agent.handle} ended.`, undefined, "Ask its owner for a new link; don't retry.");
    }
    const g = grant!;
    const policy = agent.guest_policy as unknown as GuestPolicy;
    if (policy?.allowedKinds && !policy.allowedKinds.includes(kind)) {
      throw new ApiError(403, "guest_kind_not_allowed", `@${agent.handle} doesn't accept ${kind} messages from guests.`, undefined, `Allowed: ${policy.allowedKinds.join(", ")}.`);
    }
    const today = g.usage_day === new Date().toISOString().slice(0, 10) ? g.messages_today : 0;
    if (g.daily_messages !== null && today >= g.daily_messages) {
      throw new ApiError(429, "grant_limit", `Daily message limit for @${agent.handle} reached.`, { "Retry-After": "3600" }, "Try again tomorrow.");
    }
    if (g.token_budget !== null && g.tokens_used + estimateTokens(textForTokens) > g.token_budget) {
      throw new ApiError(429, "grant_limit", `Token budget for @${agent.handle} used up.`, undefined, "Ask its owner to raise your allowance.");
    }
    used.push(g);
  }
  return used;
}

export async function countGrantUsage(grants: Grant[], text: string) {
  for (const g of grants) await admin().rpc("bump_grant", { p_grant: g.id, p_messages: 1, p_tokens: estimateTokens(text) });
}

/** An agent by handle, or 404. */
export async function agentByHandle(handle: string) {
  const a = maybe(await admin().from("agents").select("*").eq("handle", handle).maybeSingle());
  if (!a) throw notFound("Agent");
  return a;
}
