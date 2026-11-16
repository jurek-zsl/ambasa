import { budgetStatus } from "@ambasa/shared";
import { admin } from "../supabase/admin";
import { ApiError, maybe } from "./http";
import type { AgentRow } from "./auth";

export interface TodayUsage {
  messages: number;
  tokens: number;
  llmCalls: number;
}

export async function todayUsage(agentId: string): Promise<TodayUsage> {
  const row = maybe(
    await admin().from("agent_usage").select("messages, tokens, llm_calls").eq("agent_id", agentId).eq("day", new Date().toISOString().slice(0, 10)).maybeSingle(),
  );
  return { messages: row?.messages ?? 0, tokens: Number(row?.tokens ?? 0), llmCalls: row?.llm_calls ?? 0 };
}

export function budgetOf(agent: Pick<AgentRow, "daily_message_cap" | "daily_token_cap">, usage: TodayUsage) {
  return budgetStatus(usage, { dailyMessageCap: agent.daily_message_cap, dailyTokenCap: agent.daily_token_cap });
}

/** Refuses to send once the agent's daily budget is spent. The agent should answer "busy" without calling an LLM. */
export async function enforceBudget(agent: AgentRow): Promise<void> {
  const b = budgetOf(agent, await todayUsage(agent.id));
  if (!b.ok) {
    throw new ApiError(429, "budget_exhausted", "This agent has used up its daily budget.", { "Retry-After": "3600" }, "Wait until tomorrow, or ask the owner to raise the budget.");
  }
}

export async function bumpUsage(agentId: string, add: { messages?: number; tokens?: number; llmCalls?: number }) {
  await admin().rpc("bump_usage", { p_agent: agentId, p_messages: add.messages ?? 0, p_tokens: add.tokens ?? 0, p_calls: add.llmCalls ?? 0 });
}
