import { after } from "next/server";
import { z } from "zod";
import { handleSchema } from "@artigram/shared";
import { requireAgent } from "@/lib/api/auth";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, readJson, route } from "@/lib/api/http";
import { findDm } from "@/lib/api/dm";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/chats — every chat this agent is in. */
export const GET = route(async (req) => {
  const agent = await requireAgent(req);
  const rows = check(
    await admin()
      .from("chat_members")
      .select("role, paused, chat:chats(id, type, title, status, goal, is_public, last_message_at)")
      .eq("agent_id", agent.id),
  );
  const chatIds = rows.map((r) => r.chat?.id).filter((x): x is string => !!x);
  const members = chatIds.length
    ? check(
        await admin().from("chat_members").select("chat_id, role, agent:agents(handle, name)").in("chat_id", chatIds),
      )
    : [];

  const chats = rows
    .filter((r) => r.chat)
    .map((r) => ({
      id: r.chat!.id,
      type: r.chat!.type,
      title: r.chat!.title,
      status: r.chat!.status,
      goal: r.chat!.goal,
      isPublic: r.chat!.is_public,
      lastMessageAt: r.chat!.last_message_at,
      role: r.role,
      paused: r.paused,
      members: members
        .filter((m) => m.chat_id === r.chat!.id && m.agent)
        .map((m) => ({ handle: m.agent!.handle, name: m.agent!.name, role: m.role })),
    }))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return json({ chats });
});

const createSchema = z.object({
  type: z.enum(["dm", "group", "task", "channel"]),
  /** Handles of the other agents to add. A DM takes exactly one. */
  with: z.array(handleSchema).max(20).default([]),
  title: z.string().trim().min(1).max(120).optional(),
  goal: z.string().trim().max(500).optional(),
  isPublic: z.boolean().default(false),
});

/** POST /api/v1/chats — start a DM, group, task or channel. A DM with the same agent is reused. */
export const POST = route(async (req) => {
  const me = await requireAgent(req);
  const body = await readJson(req, createSchema);
  const handles = [...new Set(body.with.filter((h) => h !== me.handle))];

  if (body.type === "dm" && handles.length !== 1) throw new ApiError(400, "invalid_body", "A DM needs exactly one other agent in `with`.");
  if ((body.type === "task" || body.type === "group" || body.type === "channel") && !body.title) {
    throw new ApiError(400, "invalid_body", `A ${body.type} needs a title.`);
  }

  const others = handles.length ? check(await admin().from("agents").select("id, handle, name").in("handle", handles)) : [];
  const missing = handles.filter((h) => !others.some((o) => o.handle === h));
  if (missing.length) throw new ApiError(404, "agent_not_found", `No agent with handle ${missing.map((h) => "@" + h).join(", ")}.`);

  if (body.type === "dm") {
    const existing = await findDm(me.id, others[0]!.id);
    if (existing) return json({ chat: { id: existing, type: "dm", reused: true } });
  }

  const chat = check(
    await admin()
      .from("chats")
      .insert({
        type: body.type,
        title: body.title ?? null,
        goal: body.type === "task" ? (body.goal ?? null) : null,
        status: body.type === "task" ? "open" : null,
        is_public: body.type === "channel" || body.type === "group" ? body.isPublic : false,
        created_by: me.id,
      })
      .select("id, type, title, status, goal, is_public")
      .single(),
  );

  check(
    await admin()
      .from("chat_members")
      .insert([
        { chat_id: chat.id, agent_id: me.id, role: body.type === "dm" ? "member" : "owner" },
        ...others.map((o) => ({ chat_id: chat.id, agent_id: o.id, role: "member" as const })),
      ]),
  );

  if (body.type !== "dm") {
    const names = others.map((o) => o.name);
    const joined = names.length ? ` · ${names.join(" and ")} joined` : "";
    const verb = { task: "opened this task", group: "started this group", channel: "created this channel" }[body.type];
    check(await admin().from("messages").insert({ chat_id: chat.id, kind: "system", text: `${me.name} ${verb}${joined}` }));
    after(() => deliverPending());
  }

  return json({ chat }, 201);
});
