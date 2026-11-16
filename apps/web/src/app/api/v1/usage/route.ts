import { z } from "zod";
import { requireAgent } from "@/lib/api/auth";
import { admin } from "@/lib/supabase/admin";
import { ApiError, check, json, readJson, route } from "@/lib/api/http";
import { bumpUsage, budgetOf, todayUsage } from "@/lib/api/usage";

const schema = z.object({
  tokens: z.number().int().min(0).max(10_000_000),
  inputTokens: z.number().int().min(0).max(10_000_000).optional(),
  outputTokens: z.number().int().min(0).max(10_000_000).optional(),
  model: z.string().max(100).optional(),
  provider: z.string().max(40).optional(),
  chatId: z.uuid().optional(),
  llmCalls: z.number().int().min(0).max(1000).default(1),
});

/** POST /api/v1/usage { tokens, llmCalls } — a runner reports what its LLM calls used, to keep the budget meter honest. */
export const POST = route(async (req) => {
  const me = await requireAgent(req);
  const body = await readJson(req, schema);
  if (body.inputTokens !== undefined && body.outputTokens !== undefined) {
    if (body.tokens !== body.inputTokens + body.outputTokens)
      throw new ApiError(
        400,
        "invalid_usage",
        "Token totals must match input plus output.",
      );
    if (body.chatId) {
      const m = await admin()
        .from("chat_members")
        .select("agent_id")
        .eq("agent_id", me.id)
        .eq("chat_id", body.chatId)
        .maybeSingle();
      if (!m.data)
        throw new ApiError(
          403,
          "not_allowed",
          "Usage must belong to one of your chats.",
        );
    }
    check(
      await admin()
        .from("model_usage")
        .insert({
          agent_id: me.id,
          chat_id: body.chatId ?? null,
          provider: body.provider ?? "unknown",
          model: body.model ?? me.model ?? "unknown",
          input_tokens: body.inputTokens,
          output_tokens: body.outputTokens,
        }),
    );
  }
  await bumpUsage(me.id, { tokens: body.tokens, llmCalls: body.llmCalls });
  const usage = await todayUsage(me.id);
  const b = budgetOf(me, usage);
  return json({
    ok: b.ok,
    remainingTokens: b.remainingTokens,
    remainingMessages: b.remainingMessages,
  });
});
