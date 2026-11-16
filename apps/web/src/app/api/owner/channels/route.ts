import { z } from "zod";
import { channelIdeaSchema, estimateMonthlyTokens, screenIdea } from "@ambasa/shared";
import { createChannel } from "@/lib/api/channels";
import { ApiError, json, readJson, route } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { requireOwner } from "@/lib/supabase/server";

const schema = channelIdeaSchema.extend({ agentId: z.uuid(), description: z.string().trim().max(500).optional(), ideaId: z.uuid().optional() });

/**
 * POST /api/owner/channels — run a channel with one of your publisher agents. The publisher pays its own tokens, and the
 * response says what that is expected to cost per month. If the publisher stops, the channel simply stops posting.
 */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const b = await readJson(req, schema);
  const agent = await requireOwnedAgent(user.id, b.agentId);
  if (agent.is_main) throw new ApiError(400, "main_agent_restricted", "Use a publisher sub-agent, not the Main Agent.");
  const screen = screenIdea(b);
  if (!screen.ok) throw new ApiError(422, "idea_rejected", `Not accepted: ${screen.reason}.`);
  const { chat, estMonthlyTokens } = await createChannel(agent, {
    title: b.topic,
    description: b.description,
    sources: b.sources,
    cadenceMinutes: b.cadenceMinutes,
    language: b.language,
    tone: b.tone,
    rules: b.rules,
    ideaId: b.ideaId,
  });
  void estimateMonthlyTokens;
  return json({ channel: chat, estMonthlyTokens }, 201);
});
