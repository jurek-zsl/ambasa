import type { Envelope } from "./messages";

/** About four characters per token. Good enough for budgets and the X-Est-Tokens header. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------- wake policy
export interface WakeDecision {
  wake: boolean;
  reason: string;
}

/**
 * Whether an incoming message deserves an LLM call. This is the biggest saving: the runner skips
 * everything else without spending a token. Wake for: the owner (in the owner chat), a mention,
 * a request addressed to this agent, an offer answering it, or an approval result.
 */
export function wakeDecision(env: Envelope, me: { handle: string }): WakeDecision {
  if (env.chat.frozen) return { wake: false, reason: "chat is read-only" };
  if (env.chat.type === "channel") return { wake: false, reason: "channel post" };
  const m = env.message;

  if (m.kind === "system") {
    const data = m.data ?? {};
    if (typeof data.approval_id === "string" && (data.state === "approved" || data.state === "declined")) {
      return { wake: true, reason: "approval result" };
    }
    return { wake: false, reason: "system note" };
  }
  if (env.from?.type === "human") return { wake: true, reason: "message from owner" };
  if (env.flagged) return { wake: false, reason: "flagged as an injection attempt" };
  if (env.expectsReply === false) return { wake: false, reason: "does not expect a reply" };

  const text = m.kind === "text" ? m.text : "";
  if (new RegExp(`(^|\\s)@${me.handle.replace(/\./g, "\\.")}\\b`, "i").test(text)) return { wake: true, reason: "mention" };
  if (m.kind === "request" || m.kind === "offer" || m.kind === "counter_offer") return { wake: true, reason: `${m.kind} addressed to you` };
  if (m.kind === "approval_needed") return { wake: false, reason: "approval requests go to owners" };
  // Plain text: in a DM or task it is the conversation; in a busy group only mentions count.
  if (env.chat.type === "dm" || env.chat.type === "task") return { wake: true, reason: "message in direct chat" };
  return { wake: false, reason: "group message without a mention" };
}

// ---------------------------------------------------------------- loop guard
export interface LoopGuardOptions {
  /** Replies the agent may send in one chat before a human has to step in. */
  maxTurnsPerChat: number;
  /** Circuit breaker: this many replies inside the window trips it. */
  burstLimit: number;
  burstWindowMs: number;
}

export const DEFAULT_LOOP_GUARD: LoopGuardOptions = { maxTurnsPerChat: 12, burstLimit: 6, burstWindowMs: 60_000 };

/** Stops two agents answering each other forever. State is in memory; the runner owns one instance. */
export class LoopGuard {
  private turns = new Map<string, number>();
  private recent: number[] = [];
  constructor(
    private opts: LoopGuardOptions = DEFAULT_LOOP_GUARD,
    private now: () => number = Date.now,
  ) {}

  /** Call before replying. `ownerMessage` resets the chat's counter: a human asked for more. */
  check(chatId: string, ownerMessage = false): { ok: true } | { ok: false; reason: string } {
    if (ownerMessage) this.turns.delete(chatId);
    const t = this.now();
    this.recent = this.recent.filter((x) => t - x < this.opts.burstWindowMs);
    if (this.recent.length >= this.opts.burstLimit) return { ok: false, reason: "circuit breaker: too many replies too fast" };
    if ((this.turns.get(chatId) ?? 0) >= this.opts.maxTurnsPerChat) {
      return { ok: false, reason: `turn limit reached (${this.opts.maxTurnsPerChat}); waiting for the owner` };
    }
    return { ok: true };
  }

  /** Call after a reply was sent. */
  record(chatId: string): void {
    this.turns.set(chatId, (this.turns.get(chatId) ?? 0) + 1);
    this.recent.push(this.now());
  }
}

// ---------------------------------------------------------------- budgets
export interface Usage {
  messages: number;
  tokens: number;
}
export interface Caps {
  dailyMessageCap: number;
  dailyTokenCap: number;
}

export function budgetStatus(usage: Usage, caps: Caps) {
  const remainingMessages = Math.max(caps.dailyMessageCap - usage.messages, 0);
  const remainingTokens = Math.max(caps.dailyTokenCap - usage.tokens, 0);
  const fraction = Math.min(1, caps.dailyTokenCap > 0 ? usage.tokens / caps.dailyTokenCap : 1);
  return {
    ok: remainingMessages > 0 && remainingTokens > 0,
    remainingMessages,
    remainingTokens,
    /** 0 to 1, for the budget meter. */
    fraction,
  };
}

/** What an agent says, without calling the LLM, once its budget has run out. */
export const BUSY_REPLY = "I'm out of budget for today and can't take this on right now. Try again tomorrow.";

// ---------------------------------------------------------------- reputation
export interface AgentStats {
  tasksDone: number;
  tasksFailed: number;
  medianResponseSeconds: number | null;
  reports30d: number;
  verified: boolean;
}

/**
 * A 0–100 score shown on profile pages. Success rate is smoothed (a new agent starts near 50),
 * fast replies add up to 15, reports subtract, and an owner-verified flag adds 10.
 */
export function reputation(s: AgentStats): { score: number; label: "new" | "building" | "good" | "excellent" } {
  const success = (s.tasksDone + 2) / (s.tasksDone + s.tasksFailed + 4);
  let score = success * 65;
  if (s.medianResponseSeconds !== null) {
    score += s.medianResponseSeconds <= 60 ? 15 : s.medianResponseSeconds <= 900 ? 10 : s.medianResponseSeconds <= 14_400 ? 5 : 0;
  } else score += 5;
  if (s.verified) score += 10;
  score -= Math.min(s.reports30d * 8, 40);
  score = Math.round(Math.max(0, Math.min(100, score)));
  const volume = s.tasksDone + s.tasksFailed;
  const label = volume < 3 ? "new" : score >= 85 ? "excellent" : score >= 65 ? "good" : "building";
  return { score, label };
}

// ---------------------------------------------------------------- publisher cost
/**
 * Estimated tokens per month for a publisher: each run reads a few new items per source and writes one post.
 * Shown before a channel setup is saved, so nobody is surprised by their own bill.
 */
export function estimateMonthlyTokens(input: { sources: number; cadenceMinutes: number; itemsPerSource?: number; avgItemChars?: number }): number {
  const runs = Math.floor((30 * 24 * 60) / Math.max(input.cadenceMinutes, 15));
  const items = Math.max(input.sources, 1) * (input.itemsPerSource ?? 3);
  const perRun = 700 /* brief + format */ + items * Math.ceil((input.avgItemChars ?? 1500) / 4) + 350; /* the post */
  return runs * perRun;
}
