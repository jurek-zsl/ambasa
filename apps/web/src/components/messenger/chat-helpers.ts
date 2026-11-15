import { fromRow, summarize } from "@artigram/shared";
import { firstName } from "./format";
import type { AgentInfo, ChatRow, Member, Msg } from "./types";

export interface ChatCtx {
  userId: string;
  userName: string;
  agents: Map<string, AgentInfo>;
  myAgentIds: Set<string>;
  members: Member[];
}

export function membersOf(ctx: ChatCtx, chatId: string): Member[] {
  return ctx.members.filter((m) => m.chat_id === chatId);
}

/** A DM whose only member is one of my agents: my private chat with it. */
export function isOwnAgentChat(ctx: ChatCtx, chat: Pick<ChatRow, "id" | "type">): boolean {
  if (chat.type !== "dm") return false;
  const ms = membersOf(ctx, chat.id);
  return ms.length === 1 && ctx.myAgentIds.has(ms[0]!.agent_id);
}

/** The agent shown as this chat's face: the other side of a DM, or the channel owner. */
export function chatPeer(ctx: ChatCtx, chat: Pick<ChatRow, "id" | "type">): AgentInfo | undefined {
  const ms = membersOf(ctx, chat.id);
  if (chat.type === "channel") return ctx.agents.get(ms.find((m) => m.role === "owner")?.agent_id ?? "");
  if (chat.type === "dm") {
    const other = ms.find((m) => !ctx.myAgentIds.has(m.agent_id)) ?? ms[0];
    return other ? ctx.agents.get(other.agent_id) : undefined;
  }
  return undefined;
}

export function chatTitle(ctx: ChatCtx, chat: Pick<ChatRow, "id" | "type" | "title">): string {
  if (chat.type === "dm") return chatPeer(ctx, chat)?.name ?? chat.title ?? "Direct chat";
  return chat.title ?? "Untitled";
}

/** My agents that belong to this chat. */
export function myMembers(ctx: ChatCtx, chatId: string): Member[] {
  return membersOf(ctx, chatId).filter((m) => ctx.myAgentIds.has(m.agent_id));
}

export function senderName(ctx: ChatCtx, m: Pick<Msg, "sender_agent_id" | "sender_user_id">): string {
  if (m.sender_user_id) return m.sender_user_id === ctx.userId ? "You" : "Owner";
  if (m.sender_agent_id) return ctx.agents.get(m.sender_agent_id)?.name ?? "Agent";
  return "";
}

/** Right-hand side: me, or (outside my private agent chats) any of my agents. */
export function isMine(ctx: ChatCtx, chat: Pick<ChatRow, "id" | "type">, m: Pick<Msg, "sender_agent_id" | "sender_user_id">): boolean {
  if (m.sender_user_id === ctx.userId) return true;
  if (isOwnAgentChat(ctx, chat)) return false;
  return m.sender_agent_id !== null && ctx.myAgentIds.has(m.sender_agent_id);
}

export function previewOf(ctx: ChatCtx, chat: ChatRow): { who: string; text: string } {
  if (!chat.last_kind) return { who: "", text: "No messages yet" };
  const message = fromRow(chat.last_kind, chat.last_text, chat.last_body);
  const text = message.kind === "approval_needed" ? "Waiting for your approval" : summarize(message);
  if (chat.last_kind === "system" || chat.type === "channel") return { who: "", text };
  const name = senderName(ctx, { sender_agent_id: chat.last_sender_agent_id, sender_user_id: chat.last_sender_user_id });
  const peer = chatPeer(ctx, chat);
  if (chat.type === "dm" && !isOwnAgentChat(ctx, chat) && peer && chat.last_sender_agent_id === peer.id) return { who: "", text };
  if (isOwnAgentChat(ctx, chat) && chat.last_sender_agent_id) return { who: "", text };
  return { who: name === "You" ? "You" : firstName(name), text };
}
