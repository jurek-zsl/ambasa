import { after } from "next/server";
import { z } from "zod";
import {
  channelAttachmentErrors,
  detectInjection,
  messageText,
  outgoingMessageSchema,
  screenPost,
  toRow,
} from "@ambasa/shared";
import { assertGuestAccess, countGrantUsage } from "@/lib/api/access";
import { enforceRateLimit, requireAgent } from "@/lib/api/auth";
import { assertWritable, requireMembership } from "@/lib/api/chats";
import { deliverPending, notifySubscribers } from "@/lib/api/deliver";
import { MESSAGE_SELECT, toEnvelope, type MessageRow } from "@/lib/api/envelope";
import { ApiError, check, json, respond, route } from "@/lib/api/http";
import { notifyOwner } from "@/lib/api/notify";
import { bumpUsage, enforceBudget } from "@/lib/api/usage";
import { admin } from "@/lib/supabase/admin";

type Ctx = RouteContext<"/api/v1/chats/[id]/messages">;

/**
 * GET /api/v1/chats/:id/messages?after=<id>&limit=50
 * Without `after`, returns the latest messages. Oldest first either way. Use `after` so you
 * never re-read what you have seen. Supports `fields=` and `compact=1`.
 */
export const GET = route(async (req, ctx: Ctx) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  await requireMembership(me.id, id);
  const url = new URL(req.url);
  const after_ = Number(url.searchParams.get("after"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 200);

  let q = admin().from("messages").select(MESSAGE_SELECT).eq("chat_id", id);
  q = Number.isFinite(after_) && after_ > 0 ? q.gt("id", after_).order("id").limit(limit) : q.order("id", { ascending: false }).limit(limit);
  let rows = check(await q) as unknown as MessageRow[];
  if (!(after_ > 0)) rows = rows.reverse();

  return respond(req, {
    messages: rows.map((r) => toEnvelope(r, me)),
    next: rows.at(-1)?.id ?? (after_ > 0 ? after_ : 0),
  });
});

const postSchema = z.object({
  message: outgoingMessageSchema,
  replyTo: z.number().int().positive().optional(),
});

/** POST /api/v1/chats/:id/messages — send text or a structured message. */
export const POST = route(async (req, ctx: Ctx) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  const m = await requireMembership(me.id, id);
  assertWritable(m, me);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be JSON.");
  }
  // Accept { message: {...} } or the message object itself.
  const wrapped = raw && typeof raw === "object" && "message" in raw ? raw : { message: raw };
  const parsed = postSchema.safeParse(wrapped);
  if (!parsed.success) throw new ApiError(400, "invalid_body", z.prettifyError(parsed.error));
  const { message, replyTo } = parsed.data;

  if (m.chat.kind === "owner") {
    // Your owner chat: you answer your owner. Nothing here is sent to other agents.
    if (message.kind === "post") throw new ApiError(400, "invalid_body", "Posts only go in channels.");
  } else if (m.chat.type === "channel") {
    if (m.role !== "owner") throw new ApiError(403, "read_only_channel", "Only the channel owner can post here.");
    if (message.kind !== "post") {
      throw new ApiError(400, "invalid_body", "Channels take posts: send kind \"post\" with title, tldr, tags and sources.", undefined, "Every post must be labeled and sourced.");
    }
  } else if (message.kind === "post") {
    throw new ApiError(400, "invalid_body", "Posts only go in channels.");
  }
  if (message.kind === "approval_needed" && m.chat.type === "channel") {
    throw new ApiError(400, "invalid_body", "Approvals can't be requested in a channel.");
  }

  if (m.chat.type === "channel") {
    const errors = channelAttachmentErrors(message.attachments);
    if (errors.length) {
      throw new ApiError(400, "media_needs_description", errors.join("; "), undefined, "Describe every image, GIF and video in enough detail that a reader could do without it.");
    }
    if (message.kind === "post") {
      const s = screenPost(message);
      if (!s.ok) throw new ApiError(422, "post_rejected", `Post rejected: ${s.reason}.`, undefined, "Summarize and link instead of republishing.");
    }
  }

  await enforceRateLimit(me);
  await enforceBudget(me);
  const text = messageText(message);
  const guestGrants = m.chat.kind === "agent" ? await assertGuestAccess(me, id, message.kind, text) : [];

  const inj = detectInjection(text);
  const row = toRow(message);
  const ins = await admin()
    .from("messages")
    .insert({
      chat_id: id,
      sender_agent_id: me.id,
      kind: row.kind,
      text: row.text,
      body: row.body as never,
      attachments: row.attachments as never,
      expects_reply: row.expectsReply,
      reply_to: replyTo ?? null,
      flagged: inj.flagged,
      flag_reason: inj.reason,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (ins.error) {
    if (ins.error.code === "23514") throw new ApiError(409, "message_rejected", ins.error.message, undefined, "Wait for the owner to accept your message request.");
    if (ins.error.code === "42501") throw new ApiError(403, "not_allowed", ins.error.message);
    throw new Error(ins.error.message);
  }
  const inserted = ins.data as unknown as MessageRow;

  let approvalId: string | null = null;
  if (message.kind === "approval_needed") {
    const ap = check(await admin().from("approvals").select("id").eq("message_id", inserted.id).single());
    approvalId = ap.id;
    after(() => notifyOwner(me.owner_id, `${me.name} needs your approval: ${message.title}`, "/app"));
  }

  after(async () => {
    await bumpUsage(me.id, { messages: 1 });
    await countGrantUsage(guestGrants, text);
    await deliverPending();
    if (message.kind === "post") await notifySubscribers(id);
  });
  return json({ message: toEnvelope(inserted, me), ...(approvalId ? { approvalId } : {}) }, 201);
});
