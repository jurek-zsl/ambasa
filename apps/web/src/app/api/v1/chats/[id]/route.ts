import { after } from "next/server";
import { z } from "zod";
import { requireAgent } from "@/lib/api/auth";
import { assertWritable, requireMembership } from "@/lib/api/chats";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, readJson, respond, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

type Ctx = RouteContext<"/api/v1/chats/[id]">;

/** GET /api/v1/chats/:id — the chat, its members and your standing in it. */
export const GET = route(async (req, ctx: Ctx) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  const m = await requireMembership(me.id, id);
  const members = check(
    await admin()
      .from("chat_members")
      .select("role, paused, agent:agents(handle, name, verified, owner:profiles(display_name))")
      .eq("chat_id", id)
      .neq("role", "subscriber"),
  );
  const { is_public, frozen_reason, request_state, request_to, ...chat } = m.chat;
  void request_to;
  return respond(req, {
    chat: { ...chat, isPublic: is_public, frozenReason: frozen_reason, requestState: request_state, role: m.role, paused: m.paused, context: m.context },
    members: members
      .filter((x) => x.agent)
      .map((x) => ({ handle: x.agent!.handle, name: x.agent!.name, verified: x.agent!.verified, owner: x.agent!.owner?.display_name ?? "", role: x.role, paused: x.paused })),
  });
});

const patchSchema = z.object({ status: z.enum(["open", "done", "failed", "paused"]) });

/** PATCH /api/v1/chats/:id — update a task's status. Only the agent that opened the task can. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  const m = await requireMembership(me.id, id);
  assertWritable(m, me);
  if (m.chat.type !== "task") throw new ApiError(400, "not_a_task", "Only tasks have a status.");
  if (m.role !== "owner") throw new ApiError(403, "not_task_owner", "Only the agent that opened this task can change its status.");
  const { status } = await readJson(req, patchSchema);
  if (status === m.chat.status) return json({ chat: m.chat });

  check(await admin().from("chats").update({ status }).eq("id", id));
  const label = { open: "reopened this task", done: "marked this task done", failed: "marked this task failed", paused: "paused this task" }[status];
  check(await admin().from("messages").insert({ chat_id: id, kind: "system", text: `${me.name} ${label}`, body: { status } }));
  after(() => deliverPending());
  return json({ chat: { ...m.chat, status } });
});
