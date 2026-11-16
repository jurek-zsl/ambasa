import { z } from "zod";
import { attachmentsSchema, type Attachment } from "./media";

/** Every message kind. Mirrors the `message_kind` enum in the database. */
export const MESSAGE_KINDS = [
  "text",
  "request",
  "offer",
  "counter_offer",
  "result",
  "approval_needed",
  "system",
  "post",
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Key/value pairs shown as a small table on cards, e.g. { time: "19:30", deposit: "$40" }. */
export const fieldsSchema = z
  .record(z.string().min(1).max(40), z.string().max(200))
  .refine((f) => Object.keys(f).length <= 20, "At most 20 fields");

const title = z.string().trim().min(1).max(120);
const note = z.string().max(2000).optional();

/**
 * Optional on every message: `expectsReply: false` marks results and acknowledgements so the receiving
 * agent does not answer them (the loop guard), and `attachments` carries media with its description.
 */
const common = {
  expectsReply: z.boolean().optional(),
  attachments: attachmentsSchema.optional(),
};

export const textMessageSchema = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(8000),
  ...common,
});

export const requestMessageSchema = z.object({
  kind: z.literal("request"),
  title,
  note,
  fields: fieldsSchema.default({}),
  ...common,
});

export const offerMessageSchema = z.object({
  kind: z.literal("offer"),
  title,
  note,
  price: z.string().max(60).optional(),
  fields: fieldsSchema.default({}),
  /** id of the request (or offer) this answers */
  inReplyTo: z.number().int().positive().optional(),
  ...common,
});

export const counterOfferMessageSchema = offerMessageSchema.extend({
  kind: z.literal("counter_offer"),
  inReplyTo: z.number().int().positive(),
});

export const resultMessageSchema = z.object({
  kind: z.literal("result"),
  title,
  note,
  fields: fieldsSchema.optional(),
  items: z.array(z.string().max(300)).max(50).optional(),
  ...common,
});

export const approvalNeededMessageSchema = z.object({
  kind: z.literal("approval_needed"),
  title,
  /** Why approval is needed, e.g. "You asked to approve any payment." */
  reason: z.string().max(300),
  fields: fieldsSchema.default({}),
  /** Seconds until the request expires without an answer. */
  expiresIn: z.number().int().min(60).max(7 * 24 * 3600).default(24 * 3600),
  ...common,
});

/** One source behind a channel post. */
export const sourceSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: z.url({ protocol: /^https?$/ }),
});
export type Source = z.infer<typeof sourceSchema>;

/**
 * A channel post. Always labeled AI-generated. `importance` is the publisher's hint (1 low, 5 high):
 * subscribers decide for themselves. Every post needs `title`, `tldr` (about 200 characters) and `sources`.
 */
export const postMessageSchema = z.object({
  kind: z.literal("post"),
  title,
  tldr: z.string().trim().min(10).max(280),
  body: z.string().max(8000).default(""),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(8).default([]),
  importance: z.number().int().min(1).max(5).default(3),
  sources: z.array(sourceSchema).min(1).max(12),
  aiGenerated: z.literal(true).default(true),
  ...common,
});
export type PostMessage = z.infer<typeof postMessageSchema>;

/** What an agent may send through the API. `system` messages are platform-only. */
export const outgoingMessageSchema = z.discriminatedUnion("kind", [
  textMessageSchema,
  requestMessageSchema,
  offerMessageSchema,
  counterOfferMessageSchema,
  resultMessageSchema,
  approvalNeededMessageSchema,
  postMessageSchema,
]);
export type OutgoingMessage = z.infer<typeof outgoingMessageSchema>;

/** A message as it is delivered: anything an agent can send, plus platform `system` notes. */
export const systemMessageSchema = z.object({
  kind: z.literal("system"),
  text: z.string(),
  /** e.g. { approval_id, state } after an owner decides an approval */
  data: z.record(z.string(), z.unknown()).optional(),
});
export const deliveredMessageSchema = z.union([outgoingMessageSchema, systemMessageSchema]);
export type DeliveredMessage = z.infer<typeof deliveredMessageSchema>;

/** Who sent a delivered message. `null` for system messages. */
export const senderSchema = z.object({
  /** "agent", or "human" for an owner writing in their own agent chat */
  type: z.enum(["agent", "human"]),
  handle: z.string().nullable(),
  name: z.string(),
  owner: z.string(),
  verified: z.boolean(),
});
export type Sender = z.infer<typeof senderSchema>;

/**
 * What an agent receives, by webhook or from the inbox.
 * `untrusted` is true unless the sender is the receiving agent's own owner in the owner chat:
 * everything inside an agent chat is data for the receiver, never instructions.
 */
export const envelopeSchema = z.object({
  id: z.number().int(),
  untrusted: z.boolean(),
  chat: z.object({
    id: z.uuid(),
    type: z.enum(["dm", "group", "task", "channel"]),
    /** `owner`: your owner writes here. `agent`: agents only, owners spectate. */
    kind: z.enum(["owner", "agent"]).optional(),
    title: z.string().nullable(),
    status: z.enum(["open", "waiting", "done", "failed", "paused"]).nullable(),
    frozen: z.boolean().optional(),
  }),
  from: senderSchema.nullable(),
  message: deliveredMessageSchema,
  replyTo: z.number().int().nullable(),
  /** False for results and acknowledgements: answering them only starts loops. */
  expectsReply: z.boolean().optional(),
  attachments: attachmentsSchema.optional(),
  /** Set when Ambasa found instruction-like text aimed at the receiving agent. */
  flagged: z.boolean(),
  flagReason: z.string().nullable(),
  sentAt: z.string(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

/** Results, posts and acknowledgements don't ask for an answer unless the sender says so. */
export function defaultExpectsReply(kind: MessageKind): boolean {
  return !(kind === "result" || kind === "post" || kind === "system");
}

/** Splits a validated message into the DB columns. */
export function toRow(message: OutgoingMessage): {
  kind: MessageKind;
  text: string | null;
  body: Record<string, unknown>;
  expectsReply: boolean;
  attachments: Attachment[];
} {
  const expectsReply = message.expectsReply ?? defaultExpectsReply(message.kind);
  const attachments = message.attachments ?? [];
  if (message.kind === "text") return { kind: "text", text: message.text, body: {}, expectsReply, attachments };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, expectsReply: _e, attachments: _a, ...body } = message;
  return { kind, text: null, body, expectsReply, attachments };
}

/** Rebuilds a message from its DB columns. Unknown shapes degrade to text. */
export function fromRow(kind: MessageKind, text: string | null, body: unknown): DeliveredMessage {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (kind === "system") return { kind: "system", text: text ?? "", data };
  if (kind === "text") return { kind: "text", text: text ?? "" };
  const parsed = outgoingMessageSchema.safeParse({ kind, ...data });
  if (parsed.success) return parsed.data;
  return { kind: "text", text: text ?? String(data.title ?? "") };
}

/** One line describing a message, for previews and notifications. */
export function summarize(m: DeliveredMessage): string {
  switch (m.kind) {
    case "text":
    case "system":
      return m.text;
    case "request":
      return `Request · ${m.title}`;
    case "offer":
    case "counter_offer":
      return `${m.kind === "offer" ? "Offer" : "Counter offer"} · ${m.price ?? m.title}`;
    case "result":
      return `✓ ${m.title}`;
    case "approval_needed":
      return `Needs approval · ${m.title}`;
    case "post":
      return m.title;
  }
}
