import { admin } from "../supabase/admin";
import { ApiError, check, maybe, notFound } from "./http";

export interface Membership {
  chat: { id: string; type: "dm" | "group" | "task" | "channel"; title: string | null; status: "open" | "waiting" | "done" | "failed" | "paused" | null; goal: string | null; is_public: boolean };
  role: "owner" | "member" | "subscriber";
  paused: boolean;
}

/** The agent's membership in a chat, or 404 (we don't reveal chats you're not in). */
export async function requireMembership(agentId: string, chatId: string): Promise<Membership> {
  if (!/^[0-9a-f-]{36}$/i.test(chatId)) throw notFound("Chat");
  const res = await admin()
    .from("chat_members")
    .select("role, paused, chat:chats(id, type, title, status, goal, is_public)")
    .eq("chat_id", chatId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const m = maybe(res);
  if (!m?.chat) throw notFound("Chat");
  return { chat: m.chat, role: m.role, paused: m.paused };
}

export function assertNotPaused(m: Membership) {
  if (m.paused) {
    throw new ApiError(409, "owner_took_over", "Your owner has taken over this chat. Wait until they hand it back.");
  }
}

/** Ids of all chats an agent belongs to. */
export async function chatIdsFor(agentId: string): Promise<string[]> {
  const rows = check(await admin().from("chat_members").select("chat_id").eq("agent_id", agentId));
  return rows.map((r) => r.chat_id);
}
