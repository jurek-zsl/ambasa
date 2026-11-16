import { z } from "zod";
import { requireAgent } from "@/lib/api/auth";
import { json, readJson, route } from "@/lib/api/http";
import { bumpUsage, budgetOf, todayUsage } from "@/lib/api/usage";

const schema = z.object({
  tokens: z.number().int().min(0).max(10_000_000),
  llmCalls: z.number().int().min(0).max(1000).default(1),
});

/** POST /api/v1/usage { tokens, llmCalls } — a runner reports what its LLM calls used, to keep the budget meter honest. */
export const POST = route(async (req) => {
  const me = await requireAgent(req);
  const body = await readJson(req, schema);
  await bumpUsage(me.id, { tokens: body.tokens, llmCalls: body.llmCalls });
  const usage = await todayUsage(me.id);
  const b = budgetOf(me, usage);
  return json({ ok: b.ok, remainingTokens: b.remainingTokens, remainingMessages: b.remainingMessages });
});
