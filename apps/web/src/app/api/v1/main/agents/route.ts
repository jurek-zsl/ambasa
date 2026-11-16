import { z } from "zod";
import { requireMainAgent } from "@/lib/api/auth";
import {
  ApiError,
  check,
  json,
  maybe,
  readJson,
  respond,
  route,
} from "@/lib/api/http";
import {
  actionSchema,
  createAgentParams,
  describe,
  execute,
  needsApproval,
  type ManagementAction,
} from "@/lib/api/management";
import { notifyOwner } from "@/lib/api/notify";
import { admin } from "@/lib/supabase/admin";
import { after } from "next/server";

const MAX_CREATIONS_PER_DAY = 10;

/** GET /api/v1/main/agents — your owner's agents with today's usage and whether they are online. */
export const GET = route(async (req) => {
  const me = await requireMainAgent(req);
  const agents = check(
    await admin()
      .from("agents")
      .select(
        "id, handle, name, visibility, hosting, paused, runner_seen_at, daily_message_cap, daily_token_cap, is_main",
      )
      .eq("owner_id", me.owner_id)
      .eq("is_main", false),
  );
  const day = new Date().toISOString().slice(0, 10);
  const usage = agents.length
    ? check(
        await admin()
          .from("agent_usage")
          .select("agent_id, messages, tokens")
          .in(
            "agent_id",
            agents.map((a) => a.id),
          )
          .eq("day", day),
      )
    : [];
  const pending = check(
    await admin()
      .from("approvals")
      .select("agent_id")
      .eq("owner_id", me.owner_id)
      .eq("state", "pending"),
  );
  return respond(req, {
    agents: agents.map((a) => {
      const u = usage.find((x) => x.agent_id === a.id);
      return {
        handle: a.handle,
        name: a.name,
        visibility: a.visibility,
        hosting: a.hosting,
        stopped: a.paused,
        online:
          !!a.runner_seen_at &&
          Date.now() - Date.parse(a.runner_seen_at) < 120_000,
        budget: {
          messages: `${u?.messages ?? 0}/${a.daily_message_cap}`,
          tokens: `${u?.tokens ?? 0}/${a.daily_token_cap}`,
        },
        pendingApprovals: pending.filter((p) => p.agent_id === a.id).length,
      };
    }),
  });
});

const createSchema = createAgentParams;

/** Ask for an action: run it now if the owner allows, otherwise put an approval in the owner chat. */
export async function submit(
  mainId: string,
  ownerId: string,
  action: ManagementAction,
) {
  const settings = maybe(
    await admin()
      .from("profile_settings")
      .select("main_auto_approve")
      .eq("user_id", ownerId)
      .maybeSingle(),
  );
  if (
    !needsApproval(action) ||
    (settings?.main_auto_approve && action.type !== "delegate_task")
  ) {
    const done = await execute(ownerId, action);
    return json({ status: "done", ...done }, 201);
  }
  const chat = maybe(
    await admin()
      .from("chats")
      .select("id")
      .eq("kind", "owner")
      .eq("created_by", mainId)
      .maybeSingle(),
  );
  if (!chat) throw new Error("Main Agent has no owner chat");
  const d = await describe(action, ownerId);
  const msg = check(
    await admin()
      .from("messages")
      .insert({
        chat_id: chat.id,
        sender_agent_id: mainId,
        kind: "approval_needed",
        body: {
          title: d.title,
          reason: "The Main Agent asks before it changes your setup.",
          fields: d.fields,
          expiresIn: 86400,
          action,
        } as never,
        expects_reply: false,
      })
      .select("id")
      .single(),
  );
  const ap = check(
    await admin()
      .from("approvals")
      .select("id")
      .eq("message_id", msg.id)
      .single(),
  );
  after(() =>
    notifyOwner(
      ownerId,
      `Your Main Agent asks: ${d.title}`,
      `/app?view=approvals&approval=${ap.id}`,
    ),
  );
  return json(
    {
      status: "pending_approval",
      approvalId: ap.id,
      hint: "Wait for the owner. Check GET /api/v1/approvals/:id.",
    },
    202,
  );
}

/**
 * POST /api/v1/main/agents — create a sub-agent. Anything that talks to the outside world is a sub-agent
 * the Main Agent creates. Asks the owner first, unless they turned auto-approve on. Rate-limited to
 * 10 a day; sub-agent budgets can't add up to more than the owner's.
 */
export const POST = route(async (req) => {
  const me = await requireMainAgent(req);
  const params = await readJson(req, createSchema);
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin()
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", me.owner_id)
    .eq("is_main", false)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_CREATIONS_PER_DAY) {
    throw new ApiError(
      429,
      "creation_limit",
      `At most ${MAX_CREATIONS_PER_DAY} agents a day.`,
      { "Retry-After": "3600" },
      "Try again tomorrow.",
    );
  }
  return submit(
    me.id,
    me.owner_id,
    actionSchema.parse({ type: "create_agent", params }),
  );
});

void z;
