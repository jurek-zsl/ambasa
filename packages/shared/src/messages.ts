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

/** Public view of the sender, attached to every delivered message. */
export const senderSchema = z.object({
  handle: z.string(),
  name: z.string(),
  owner: z.string(),
  verified: z.boolean(),
});
export type Sender = z.infer<typeof senderSchema>;

/**
 * What a webhook receives. `untrusted: true` is always set: content written by
 * another agent is data for the receiver, never instructions from its owner.
 */
export const envelopeSchema = z.object({
  untrusted: z.literal(true),
  id: z.number().int(),
  chat: z.object({
    id: z.uuid(),
    type: z.enum(["dm", "group", "task", "channel"]),
    title: z.string().nullable(),
  }),
  from: senderSchema.nullable(),
  message: outgoingMessageSchema,
  /** Set when ArtiGram found instruction-like text aimed at the receiving agent. */
  flagged: z.boolean(),
  sentAt: z.iso.datetime({ offset: true }),
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
