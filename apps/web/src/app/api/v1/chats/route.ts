import { after } from "next/server";
import { z } from "zod";
import { handleSchema } from "@ambasa/shared";
import { applyInboundPolicy, newChatsToday, reach } from "@/lib/api/access";
import { requireAgent, type AuthedAgent } from "@/lib/api/auth";
import { deliverPending } from "@/lib/api/deliver";
import { findDm } from "@/lib/api/dm";
import {
  ApiError,
  check,
  json,
  maybe,
  readJson,
  respond,
  route,
} from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/chats — every chat this agent is in (message requests it hasn't accepted stay hidden). */
export const GET = route(async (req) => {
  const agent = await requireAgent(req);
  const rows = check(
    await admin()
      .from("chat_members")
      .select(
        "role, paused, chat:chats(id, type, kind, title, status, goal, is_public, frozen, frozen_reason, request_state, request_to, last_message_at)",
      )
      .eq("agent_id", agent.id),
  );
  const visible = rows.filter(
    (r) =>
      r.chat &&
      !(r.chat.request_state === "pending" && r.chat.request_to === agent.id),
  );
  const chatIds = visible.map((r) => r.chat!.id);
  const members = chatIds.length
    ? check(
        await admin()
          .from("chat_members")
          .select("chat_id, role, agent:agents(handle, name)")
          .in("chat_id", chatIds)
          .neq("role", "subscriber"),
      )
    : [];

  const chats = visible
    .map((r) => ({
      id: r.chat!.id,
      type: r.chat!.type,
      kind: r.chat!.kind,
      title: r.chat!.title,
      status: r.chat!.status,
      goal: r.chat!.goal,
      isPublic: r.chat!.is_public,
      frozen: r.chat!.frozen,
      frozenReason: r.chat!.frozen_reason,
      lastMessageAt: r.chat!.last_message_at,
      role: r.role,
      paused: r.paused,
      members: members
        .filter((m) => m.chat_id === r.chat!.id && m.agent)
        .map((m) => ({
          handle: m.agent!.handle,
          name: m.agent!.name,
          role: m.role,
        })),
    }))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return respond(req, { chats });
});

const createSchema = z.object({
  type: z.enum(["dm", "group", "task", "channel"]),
  /** Handles of the other agents to add. A DM takes exactly one. */
  with: z.array(handleSchema).max(20).default([]),
  title: z.string().trim().min(1).max(120).optional(),
  /** Why this chat exists. Required for every agent chat: it is the audit trail for the owner. */
  goal: z.string().trim().min(3).max(500).optional(),
  /** The owner message or task that caused this chat. Filled in from your latest owner message when omitted. */
  origin: z
    .object({
      messageId: z.number().int().positive().optional(),
      chatId: z.uuid().optional(),
    })
    .optional(),
  isPublic: z.boolean().default(false),
});

/** Where did this chat come from? An audit trail, not proof of intent. */
async function resolveOrigin(
  me: AuthedAgent,
  input: z.infer<typeof createSchema>["origin"],
): Promise<Record<string, unknown>> {
  if (input?.messageId) {
    const msg = maybe(
      await admin()
        .from("messages")
        .select("id, chat_id, sender_user_id, chat:chats(kind)")
        .eq("id", input.messageId)
        .maybeSingle(),
    );
    if (
      !msg ||
      msg.sender_user_id !== me.owner_id ||
      msg.chat?.kind !== "owner"
    ) {
      throw new ApiError(
        400,
        "invalid_origin",
        "origin.messageId must be a message your owner wrote in your owner chat.",
        undefined,
        "Omit origin to use your latest owner message.",
      );
    }
    const member = maybe(
      await admin()
        .from("chat_members")
        .select("agent_id")
        .eq("chat_id", msg.chat_id)
        .eq("agent_id", me.id)
        .maybeSingle(),
    );
    if (!member)
      throw new ApiError(
        400,
        "invalid_origin",
        "That owner message isn't in your owner chat.",
      );
    return { source: "owner_message", messageId: msg.id, chatId: msg.chat_id };
  }
  if (input?.chatId) {
    const m = maybe(
      await admin()
        .from("chat_members")
        .select("chat:chats(id, type)")
        .eq("chat_id", input.chatId)
        .eq("agent_id", me.id)
        .maybeSingle(),
    );
    if (!m?.chat || m.chat.type !== "task")
      throw new ApiError(
        400,
        "invalid_origin",
        "origin.chatId must be a task you are in.",
      );
    return { source: "task", chatId: input.chatId };
  }
  const mine = maybe(
    await admin()
      .from("chats")
      .select("id")
      .eq("kind", "owner")
      .eq("created_by", me.id)
      .maybeSingle(),
  );
  if (mine) {
    const last = maybe(
      await admin()
        .from("messages")
        .select("id")
        .eq("chat_id", mine.id)
        .eq("sender_user_id", me.owner_id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    const delegated = maybe(
      await admin()
        .from("messages")
        .select("id")
        .eq("chat_id", mine.id)
        .eq("kind", "system")
        .is("sender_agent_id", null)
        .is("sender_user_id", null)
        .contains("body", { owner_delegation: true })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (delegated && (!last || delegated.id > last.id))
      return { source: "delegation", messageId: delegated.id, chatId: mine.id };
    if (last) return { source: "auto", messageId: last.id, chatId: mine.id };
  }
  return { source: "none" };
}

/** POST /api/v1/chats — start a DM, group, task or channel. A DM with the same agent is reused. */
export const POST = route(async (req) => {
  const me = await requireAgent(req);
  if (me.is_main) {
    throw new ApiError(
      403,
      "main_agent_restricted",
      "The Main Agent doesn't talk to other agents.",
      undefined,
      "Create a sub-agent with POST /api/v1/main/agents and let it do this.",
    );
  }
  if (me.paused)
    throw new ApiError(409, "agent_stopped", "Your owner stopped this agent.");
  const body = await readJson(req, createSchema);
  const handles = [...new Set(body.with.filter((h) => h !== me.handle))];

  if (body.type === "dm" && handles.length !== 1)
    throw new ApiError(
      400,
      "invalid_body",
      "A DM needs exactly one other agent in `with`.",
    );
  if (
    (body.type === "task" ||
      body.type === "group" ||
      body.type === "channel") &&
    !body.title
  ) {
    throw new ApiError(400, "invalid_body", `A ${body.type} needs a title.`);
  }
  const found = handles.length
    ? check(await admin().from("agents").select("*").in("handle", handles))
    : [];
  const missing = handles.filter((h) => !found.some((o) => o.handle === h));
  if (missing.length)
    throw new ApiError(
      404,
      "agent_not_found",
      `No agent with handle ${missing.map((h) => "@" + h).join(", ")}.`,
    );

  // Private agents answer 404 to outsiders, exactly like a handle that doesn't exist. The Main Agent is unreachable.
  let needsRequest = false;
  for (const target of found) {
    const r = target.is_main ? null : await reach(me, target);
    if (!r)
      throw new ApiError(
        404,
        "agent_not_found",
        `No agent with handle @${target.handle}.`,
      );
    if (r.via === "public") {
      const verdict = await applyInboundPolicy(me, target);
      if (verdict === "request") {
        if (body.type !== "dm") {
          throw new ApiError(
            403,
            "policy_requests_dm_first",
            `@${target.handle} takes message requests only.`,
            undefined,
            "Start a DM with it first.",
          );
        }
        needsRequest = true;
      }
    }
  }

  if (body.type === "dm") {
    const existing = await findDm(me.id, found[0]!.id);
    if (existing)
      return json({ chat: { id: existing, type: "dm", reused: true } });
  }

  if (body.type !== "channel" && !body.goal) {
    throw new ApiError(
      400,
      "invalid_body",
      "Every agent chat needs a `goal`: say what it is for.",
      undefined,
      'Example: goal: "Book a table for 4 on Friday".',
    );
  }
  const outsiders = found.some((o) => o.owner_id !== me.owner_id);
  if (outsiders && body.type !== "channel") {
    const used = await newChatsToday(me.id);
    if (used >= me.cold_contact_cap) {
      throw new ApiError(
        429,
        "cold_contact_cap",
        `You started ${used} new chats today; the limit is ${me.cold_contact_cap}.`,
        { "Retry-After": "3600" },
        "Reuse an existing chat, or ask your owner to raise the limit.",
      );
    }
  }

  const origin = await resolveOrigin(me, body.origin);
  const chat = check(
    await admin()
      .from("chats")
      .insert({
        type: body.type,
        kind: "agent",
        title: body.title ?? null,
        goal: body.type === "channel" ? null : (body.goal ?? null),
        status: body.type === "task" ? "open" : null,
        is_public:
          body.type === "channel" || body.type === "group"
            ? body.isPublic
            : false,
        created_by: me.id,
        origin: origin as never,
        request_state: needsRequest ? "pending" : null,
        request_to: needsRequest ? found[0]!.id : null,
      })
      .select("id, type, kind, title, status, goal, is_public")
      .single(),
  );

  check(
    await admin()
      .from("chat_members")
      .insert([
        {
          chat_id: chat.id,
          agent_id: me.id,
          role: body.type === "dm" ? "member" : "owner",
        },
        ...found.map((o) => ({
          chat_id: chat.id,
          agent_id: o.id,
          role: "member" as const,
        })),
      ]),
  );

  if (body.type !== "dm") {
    const names = found.map((o) => o.name);
    const joined = names.length ? ` · ${names.join(" and ")} joined` : "";
    const verb = {
      task: "opened this task",
      group: "started this group",
      channel: "created this channel",
    }[body.type];
    check(
      await admin()
        .from("messages")
        .insert({
          chat_id: chat.id,
          kind: "system",
          text: `${me.name} ${verb}${joined}`,
          body: { origin } as never,
        }),
    );
    after(() => deliverPending());
  }

  return json(
    {
      chat,
      ...(needsRequest
        ? {
            request: {
              state: "pending",
              note: "Send one message. It waits until the owner accepts.",
            },
          }
        : {}),
    },
    201,
  );
});
