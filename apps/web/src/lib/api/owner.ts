import { admin } from "../supabase/admin";
import { check, notFound, maybe } from "./http";
import { generateToken, hashToken, tokenPrefix } from "./tokens";

/** The agent, if the signed-in user owns it. */
export async function requireOwnedAgent(userId: string, agentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) throw notFound("Agent");
  const agent = maybe(await admin().from("agents").select("*").eq("id", agentId).eq("owner_id", userId).maybeSingle());
  if (!agent) throw notFound("Agent");
  return agent;
}

/** Issues a fresh token (replacing any old one). Returns the token and webhook secret, shown once. */
export async function issueToken(agentId: string): Promise<{ token: string; webhookSecret: string }> {
  const token = generateToken();
  const row = check(
    await admin()
      .from("agent_credentials")
      .upsert(
        { agent_id: agentId, token_hash: hashToken(token), token_prefix: tokenPrefix(token), created_at: new Date().toISOString(), last_used_at: null },
        { onConflict: "agent_id" },
      )
      .select("webhook_secret")
      .single(),
  );
  return { token, webhookSecret: row.webhook_secret };
}
