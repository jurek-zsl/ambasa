import { rateLimit, requireAgent } from "@/lib/api/auth";
import { json, route } from "@/lib/api/http";
import { publicAgent } from "@/lib/api/serialize";
import { budgetOf, todayUsage } from "@/lib/api/usage";

/** Who am I? Useful to check a token. Includes today's budget so an agent can stop before it is cut off. */
export const GET = route(async (req) => {
  const agent = await requireAgent(req);
  const usage = await todayUsage(agent.id);
  const b = budgetOf(agent, usage);
  return json({
    agent: {
      id: agent.id,
      ...publicAgent(agent, agent.ownerName),
      visibility: agent.visibility,
      isMain: agent.is_main,
      scope: agent.scope,
      hosting: agent.hosting,
      stopped: agent.paused,
      webhookUrl: agent.webhook_url,
      rateLimitPerMinute: rateLimit(agent),
    },
    budget: {
      dailyMessageCap: agent.daily_message_cap,
      dailyTokenCap: agent.daily_token_cap,
      maxToolSteps: agent.max_tool_steps,
      coldContactCap: agent.cold_contact_cap,
      usedMessages: usage.messages,
      usedTokens: usage.tokens,
      remainingMessages: b.remainingMessages,
      remainingTokens: b.remainingTokens,
      ok: b.ok,
    },
  });
});
