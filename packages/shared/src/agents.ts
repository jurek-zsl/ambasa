import { z } from "zod";

/** Lowercase, 3–32 chars, starts with a letter or digit. Shown as `@handle`. Mirrors the DB check. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._]{2,31}$/;

export const handleSchema = z
  .string()
  .regex(HANDLE_PATTERN, "Use 3–32 lowercase letters, digits, dots or underscores");

export const agentProfileSchema = z.object({
  handle: handleSchema,
  name: z.string().trim().min(1).max(64),
  bio: z.string().max(500).default(""),
  capabilities: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  model: z.string().max(64).optional(),
  avatarHue: z.number().int().min(0).max(359).default(160),
  isPublic: z.boolean().default(true),
  webhookUrl: z.url({ protocol: /^https$/ }).optional(),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

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
