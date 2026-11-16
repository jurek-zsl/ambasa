import type { AgentProfile, Brief } from "@ambasa/shared";
import { admin } from "../supabase/admin";
import { ApiError, check, notFound, maybe } from "./http";
import { generateToken, hashToken, tokenPrefix } from "./tokens";
import { webhookUrlProblem } from "./webhook-url";

/** The agent, if the signed-in user owns it. */
export async function requireOwnedAgent(userId: string, agentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) throw notFound("Agent");
  const agent = maybe(await admin().from("agents").select("*").eq("id", agentId).eq("owner_id", userId).maybeSingle());
  if (!agent) throw notFound("Agent");
  return agent;
}

/** Issues a fresh token (replacing any old one). Returns the token and webhook secret, shown once. */
export async function issueToken(agentId: string, scope: "agent" | "main" = "agent"): Promise<{ token: string; webhookSecret: string }> {
  const token = generateToken(scope);
  const row = check(
    await admin()
      .from("agent_credentials")
      .upsert(
        { agent_id: agentId, token_hash: hashToken(token), token_prefix: tokenPrefix(token), scope, created_at: new Date().toISOString(), last_used_at: null },
        { onConflict: "agent_id" },
      )
      .select("webhook_secret")
      .single(),
  );
  return { token, webhookSecret: row.webhook_secret };
}

/** Database limits (agent count, budgets) come back as check violations; show them to the owner as 400s. */
export function limitError(error: { code?: string; message: string } | null): ApiError | null {
  if (!error) return null;
  if (error.code === "23514") return new ApiError(400, "limit_reached", error.message, undefined, "Lower this agent's budget or remove one you don't use.");
  if (error.code === "23505") return new ApiError(409, "conflict", "That handle or Main Agent already exists.");
  return null;
}

/**
 * Creates an agent with its private owner chat, brief and token. Used by the dashboard, the Main Agent
 * (after approval) and the device-code login for runners.
 */
export async function createAgent(
  ownerId: string,
  p: AgentProfile,
  opts: { brief?: Partial<Brief>; isMain?: boolean } = {},
) {
  const urlProblem = p.webhookUrl ? webhookUrlProblem(p.webhookUrl) : null;
  if (urlProblem) throw new ApiError(400, "invalid_webhook_url", urlProblem);
  if (maybe(await admin().from("agents").select("id").eq("handle", p.handle).maybeSingle())) {
    throw new ApiError(409, "handle_taken", `@${p.handle} is taken.`, undefined, "Try another handle.");
  }

  const ins = await admin()
    .from("agents")
    .insert({
      owner_id: ownerId,
      handle: p.handle,
      name: p.name,
      bio: p.bio,
      capabilities: p.capabilities,
      model: p.model ?? null,
      avatar_hue: p.avatarHue,
      visibility: opts.isMain ? "private" : p.visibility,
      inbound_policy: p.inboundPolicy,
      hosting: p.hosting,
      webhook_url: p.webhookUrl ?? null,
      daily_message_cap: p.dailyMessageCap,
      daily_token_cap: p.dailyTokenCap,
      max_tool_steps: p.maxToolSteps,
      cold_contact_cap: p.coldContactCap,
      is_main: opts.isMain ?? false,
    })
    .select("*")
    .single();
  const le = limitError(ins.error);
  if (le) throw le;
  const agent = check(ins);

  // Every agent gets a private chat with its owner: the only place its owner writes to it.
  const chat = check(
    await admin().from("chats").insert({ type: "dm", kind: "owner", title: agent.name, created_by: agent.id }).select("id").single(),
  );
  check(await admin().from("chat_members").insert({ chat_id: chat.id, agent_id: agent.id, role: "owner" }));
  check(
    await admin().from("messages").insert({
      chat_id: chat.id,
      kind: "system",
      text: opts.isMain
        ? `This is your Main Agent. It creates and manages your other agents and asks before it acts. Only you can reach it.`
        : `This is your private chat with ${agent.name}. What you write here reaches it as trusted instructions.`,
    }),
  );
  if (opts.brief) {
    check(await admin().from("agent_briefs").upsert({ agent_id: agent.id, template: opts.brief.template ?? "custom", instructions: opts.brief.instructions ?? "", role: opts.brief.role ?? "" }));
  }
  const creds = await issueToken(agent.id, opts.isMain ? "main" : "agent");
  return { agent, ownerChatId: chat.id, ...creds };
}
