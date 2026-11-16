import { z } from "zod";
import { MESSAGE_KINDS } from "./messages";

/** Lowercase, 3–32 chars, starts with a letter or digit. Shown as `@handle`. Mirrors the DB check. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._]{2,31}$/;

export const handleSchema = z
  .string()
  .regex(HANDLE_PATTERN, "Use 3–32 lowercase letters, digits, dots or underscores");

/**
 * Who can reach an agent.
 *  - public: listed in the directory, any agent can contact it (subject to its inbound policy).
 *  - unlisted: not listed; agents holding a share link or a grant.
 *  - private: the owner's own agents plus explicit grants. Outsiders get 404, never 403.
 */
export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Public agents only: anyone, verified agents only, contacts only, or message requests (first message waits). */
export const INBOUND_POLICIES = ["anyone", "verified", "contacts", "requests"] as const;
export type InboundPolicy = (typeof INBOUND_POLICIES)[number];

/** Where an agent's loop runs: its own infrastructure, our hosted worker, or the owner's self-hosted runner. */
export const HOSTING_MODES = ["external", "hosted", "runner"] as const;
export type Hosting = (typeof HOSTING_MODES)[number];

/** Which message kinds guests may send into chats with a shareable agent, and which need the owner's approval. */
export const guestPolicySchema = z.object({
  allowedKinds: z.array(z.enum(MESSAGE_KINDS)).default(["text", "request"]),
  approveKinds: z.array(z.enum(MESSAGE_KINDS)).default([]),
});
export type GuestPolicy = z.infer<typeof guestPolicySchema>;

export const budgetSchema = z.object({
  /** Messages the agent may send per day. */
  dailyMessageCap: z.number().int().min(0).max(100_000).default(500),
  /** Estimated LLM tokens per day. Sub-agent budgets add up to at most the owner's budget. */
  dailyTokenCap: z.number().int().min(0).max(100_000_000).default(100_000),
  /** Maximum tool steps in one turn: the circuit breaker for loops. */
  maxToolSteps: z.number().int().min(1).max(50).default(8),
  /** New chats with agents it has never talked to, per day. */
  coldContactCap: z.number().int().min(0).max(500).default(20),
});
export type Budget = z.infer<typeof budgetSchema>;

export const agentProfileSchema = z.object({
  handle: handleSchema,
  name: z.string().trim().min(1).max(64),
  bio: z.string().max(500).default(""),
  capabilities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  model: z.string().max(64).optional(),
  avatarHue: z.number().int().min(0).max(359).default(160),
  visibility: z.enum(VISIBILITIES).default("public"),
  inboundPolicy: z.enum(INBOUND_POLICIES).default("anyone"),
  hosting: z.enum(HOSTING_MODES).default("external"),
  webhookUrl: z.url({ protocol: /^https?$/ }).optional(),
  ...budgetSchema.shape,
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

/** Templates pre-fill the brief. */
export const BRIEF_TEMPLATES = ["assistant", "researcher", "shopper", "publisher", "custom"] as const;
export type BriefTemplate = (typeof BRIEF_TEMPLATES)[number];

export const briefSchema = z.object({
  template: z.enum(BRIEF_TEMPLATES).default("custom"),
  /** Layer 2: persona, goals, tone, hard limits. */
  instructions: z.string().max(4000).default(""),
  /** Layer 3: what it does and who it talks to. Also used for directory search. */
  role: z.string().max(1000).default(""),
});
export type Brief = z.infer<typeof briefSchema>;

/**
 * Things an agent must ask its owner about before doing them.
 * Stored in the `rules` table, keyed by these names.
 */
export const RULE_KEYS = [
  "approve_payments",
  "approve_share_contact",
  "approve_terms",
  "approve_unverified_agents",
  "quiet_hours",
  "max_spend",
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

/** API tokens look like `ag_live_<32 base62 chars>`; only a SHA-256 hash is stored. */
export const TOKEN_PREFIX = "ag_live_";
/** The Main Agent's token. It alone can call the management endpoints. */
export const MAIN_TOKEN_PREFIX = "ag_main_";
