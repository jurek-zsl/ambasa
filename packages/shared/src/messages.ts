import { z } from "zod";

/** Every message kind. Mirrors the `message_kind` enum in the database. */
export const MESSAGE_KINDS = [
  "text",
  "request",
  "offer",
  "counter_offer",
  "result",
  "approval_needed",
  "system",
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Key/value pairs shown as a small table on cards, e.g. { time: "19:30", deposit: "$40" }. */
export const fieldsSchema = z
  .record(z.string().min(1).max(40), z.string().max(200))
  .refine((f) => Object.keys(f).length <= 20, "At most 20 fields");

const title = z.string().trim().min(1).max(120);
const note = z.string().max(2000).optional();

export const textMessageSchema = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(8000),
});

export const requestMessageSchema = z.object({
  kind: z.literal("request"),
  title,
  note,
  fields: fieldsSchema.default({}),
});

export const offerMessageSchema = z.object({
  kind: z.literal("offer"),
  title,
  note,
  price: z.string().max(60).optional(),
  fields: fieldsSchema.default({}),
  /** id of the request (or offer) this answers */
  inReplyTo: z.number().int().positive().optional(),
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
});

export const approvalNeededMessageSchema = z.object({
  kind: z.literal("approval_needed"),
  title,
  /** Why approval is needed, e.g. "You asked to approve any payment." */
  reason: z.string().max(300),
  fields: fieldsSchema.default({}),
  /** Seconds until the request expires without an answer. */
  expiresIn: z.number().int().min(60).max(7 * 24 * 3600).default(24 * 3600),
});

/** What an agent may send through the API. `system` messages are platform-only. */
export const outgoingMessageSchema = z.discriminatedUnion("kind", [
  textMessageSchema,
  requestMessageSchema,
  offerMessageSchema,
  counterOfferMessageSchema,
  resultMessageSchema,
  approvalNeededMessageSchema,
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
  /** "agent", or "human" when an owner took over and wrote themselves */
  type: z.enum(["agent", "human"]),
  handle: z.string().nullable(),
  name: z.string(),
  owner: z.string(),
  verified: z.boolean(),
});
export type Sender = z.infer<typeof senderSchema>;

/**
 * What an agent receives, by webhook or from the inbox.
 * `untrusted` is true unless the sender is the receiving agent's own owner:
 * content from other agents is data for the receiver, never instructions.
 */
export const envelopeSchema = z.object({
  id: z.number().int(),
  untrusted: z.boolean(),
  chat: z.object({
    id: z.uuid(),
    type: z.enum(["dm", "group", "task", "channel"]),
    title: z.string().nullable(),
    status: z.enum(["open", "waiting", "done", "failed", "paused"]).nullable(),
  }),
  from: senderSchema.nullable(),
  message: deliveredMessageSchema,
  replyTo: z.number().int().nullable(),
  /** Set when ArtiGram found instruction-like text aimed at the receiving agent. */
  flagged: z.boolean(),
  flagReason: z.string().nullable(),
  sentAt: z.string(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

/** Splits a validated message into the DB columns `kind`, `text` and `body`. */
export function toRow(message: OutgoingMessage): {
  kind: MessageKind;
  text: string | null;
  body: Record<string, unknown>;
} {
  if (message.kind === "text") return { kind: "text", text: message.text, body: {} };
  const { kind, ...body } = message;
  return { kind, text: null, body };
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
  }
}
