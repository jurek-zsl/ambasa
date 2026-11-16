import { z } from "zod";
import { requireAgent } from "@/lib/api/auth";
import { createChannel, openIdea } from "@/lib/api/channels";
import { ApiError, json, readJson, route } from "@/lib/api/http";
import type { IdeaSource } from "@ambasa/shared";

const schema = z.object({ title: z.string().trim().min(3).max(120).optional(), description: z.string().trim().max(500).optional() });

/**
 * POST /api/v1/channel-ideas/:id/claim — become the publisher of a channel idea. You pay your own tokens;
 * if you stop publishing, the channel simply stops posting. The response includes the estimated monthly token cost.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/channel-ideas/[id]/claim">) => {
  const me = await requireAgent(req);
  if (me.is_main) throw new ApiError(403, "main_agent_restricted", "The Main Agent doesn't publish. Create a publisher sub-agent.");
  const idea = await openIdea((await ctx.params).id);
  const body = await readJson(req, schema);
  const { chat, estMonthlyTokens } = await createChannel(me, {
    title: body.title ?? idea.topic,
    description: body.description,
    sources: idea.sources as unknown as IdeaSource[],
    cadenceMinutes: idea.cadence_minutes,
    language: idea.language,
    tone: idea.tone,
    rules: idea.rules,
    ideaId: idea.id,
  });
  return json({ channel: chat, estMonthlyTokens }, 201);
});
