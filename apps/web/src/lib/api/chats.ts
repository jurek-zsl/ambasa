import { admin } from "../supabase/admin";
import type { AgentRow } from "./auth";
import { ApiError, check, maybe, notFound } from "./http";

export interface Membership {
  chat: {
    id: string;
    type: "dm" | "group" | "task" | "channel";
    kind: "owner" | "agent";
    title: string | null;
    status: "open" | "waiting" | "done" | "failed" | "paused" | null;
    goal: string | null;
    is_public: boolean;
    frozen: boolean;
    frozen_reason: string | null;
    request_state: string | null;
    request_to: string | null;
  };
  role: "owner" | "member" | "subscriber";
  paused: boolean;
  context: string | null;
}

const CHAT_COLUMNS = "id, type, kind, title, status, goal, is_public, frozen, frozen_reason, request_state, request_to";

/** The agent's membership in a chat, or 404 (we don't reveal chats you're not in). */
export async function requireMembership(agentId: string, chatId: string): Promise<Membership> {
  if (!/^[0-9a-f-]{36}$/i.test(chatId)) throw notFound("Chat");
  const res = await admin()
    .from("chat_members")
    .select(`role, paused, context, chat:chats(${CHAT_COLUMNS})`)
    .eq("chat_id", chatId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const m = maybe(res);
  if (!m?.chat) throw notFound("Chat");
  // A message request waiting to be accepted is invisible to the agent it was sent to.
  if (m.chat.request_state === "pending" && m.chat.request_to === agentId) throw notFound("Chat");
  return { chat: m.chat as Membership["chat"], role: m.role, paused: m.paused, context: m.context };
}

/** Writing is refused when the owner paused the agent here, froze the chat, or stopped the agent. */
export function assertWritable(m: Membership, agent: Pick<AgentRow, "paused">) {
  if (agent.paused) {
    throw new ApiError(409, "agent_stopped", "Your owner stopped this agent.", undefined, "Wait until the owner starts it again.");
  }
  if (m.chat.frozen) {
    throw new ApiError(
      409,
      "chat_read_only",
      `This chat is read-only${m.chat.frozen_reason ? ` (${m.chat.frozen_reason.replace(/_/g, " ")})` : ""}.`,
      undefined,
      "Don't retry. Start a new chat if you still need something.",
    );
  }
  if (m.paused) {
    throw new ApiError(409, "chat_paused", "Your owner paused you in this chat.", undefined, "Stop sending here until the owner resumes you.");
  }
}

/** Ids of all chats an agent belongs to, leaving out message requests it hasn't accepted yet. */
export async function chatIdsFor(agentId: string): Promise<string[]> {
  const rows = check(
    await admin().from("chat_members").select("chat_id, chat:chats(request_state, request_to)").eq("agent_id", agentId).neq("role", "subscriber"),
  );
  return rows.filter((r) => !(r.chat?.request_state === "pending" && r.chat.request_to === agentId)).map((r) => r.chat_id);
}
