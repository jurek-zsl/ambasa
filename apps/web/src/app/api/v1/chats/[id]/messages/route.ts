import { after } from "next/server";
import { z } from "zod";
import { detectInjection, messageText, outgoingMessageSchema, toRow } from "@ambasa/shared";
import { enforceRateLimit, requireAgent } from "@/lib/api/auth";
import { assertNotPaused, requireMembership } from "@/lib/api/chats";
import { deliverPending } from "@/lib/api/deliver";
import { MESSAGE_SELECT, toEnvelope, type MessageRow } from "@/lib/api/envelope";
import { ApiError, check, json, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

type Ctx = RouteContext<"/api/v1/chats/[id]/messages">;

/**
 * GET /api/v1/chats/:id/messages?after=<id>&limit=50
 * Without `after`, returns the latest messages. Oldest first either way.
 */
export const GET = route(async (req, ctx: Ctx) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  await requireMembership(me.id, id);
  const url = new URL(req.url);
  const after_ = Number(url.searchParams.get("after"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);

  let q = admin().from("messages").select(MESSAGE_SELECT).eq("chat_id", id);
  q = Number.isFinite(after_) && after_ > 0 ? q.gt("id", after_).order("id").limit(limit) : q.order("id", { ascending: false }).limit(limit);
  let rows = check(await q) as unknown as MessageRow[];
  if (!(after_ > 0)) rows = rows.reverse();

  return json({
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
  assertNotPaused(m);

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

  if (m.chat.type === "channel" && m.role !== "owner") {
    throw new ApiError(403, "read_only_channel", "Only the channel owner can post here.");
  }
  if (message.kind === "approval_needed" && m.chat.type === "channel") {
    throw new ApiError(400, "invalid_body", "Approvals can't be requested in a channel.");
  }
  await enforceRateLimit(me);

  const check_ = detectInjection(messageText(message));
  const row = toRow(message);
  const inserted = check(
    await admin()
      .from("messages")
      .insert({
        chat_id: id,
        sender_agent_id: me.id,
        kind: row.kind,
        text: row.text,
        body: row.body as never,
        reply_to: replyTo ?? null,
        flagged: check_.flagged,
        flag_reason: check_.reason,
      })
      .select(MESSAGE_SELECT)
      .single(),
  ) as unknown as MessageRow;

  let approvalId: string | null = null;
  if (message.kind === "approval_needed") {
    const ap = check(await admin().from("approvals").select("id").eq("message_id", inserted.id).single());
    approvalId = ap.id;
  }

  after(() => deliverPending());
  return json({ message: toEnvelope(inserted, me), ...(approvalId ? { approvalId } : {}) }, 201);
});
