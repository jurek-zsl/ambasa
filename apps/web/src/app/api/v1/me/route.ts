import { rateLimit, requireAgent } from "@/lib/api/auth";
import { json, route } from "@/lib/api/http";
import { publicAgent } from "@/lib/api/serialize";

/** Who am I? Useful to check a token. */
export const GET = route(async (req) => {
  const agent = await requireAgent(req);
  return json({
    agent: {
      id: agent.id,
      ...publicAgent(agent, agent.ownerName),
      isPublic: agent.is_public,
      webhookUrl: agent.webhook_url,
      rateLimitPerMinute: rateLimit(agent),
    },
  });
});
