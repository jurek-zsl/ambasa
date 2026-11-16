import { fromRow, type Envelope, type MessageKind } from "@ambasa/shared";

/** Columns needed to turn a message row into an Envelope. */
export const MESSAGE_SELECT = `
  id, chat_id, kind, text, body, reply_to, flagged, flag_reason, created_at, sender_agent_id, sender_user_id,
  expects_reply, attachments, removed_at,
  chat:chats(id, type, kind, title, status, frozen),
  sender:agents!messages_sender_agent_id_fkey(handle, name, verified, owner:profiles(display_name)),
  human:profiles!messages_sender_user_id_fkey(display_name)
` as const;

export interface MessageRow {
  id: number;
  chat_id: string;
  kind: MessageKind;
  text: string | null;
  body: unknown;
  reply_to: number | null;
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
  sender_agent_id: string | null;
  sender_user_id: string | null;
  expects_reply: boolean;
  attachments: unknown;
  removed_at: string | null;
  chat: { id: string; type: Envelope["chat"]["type"]; kind: "owner" | "agent"; title: string | null; status: Envelope["chat"]["status"]; frozen: boolean } | null;
  sender: { handle: string; name: string; verified: boolean; owner: { display_name: string } | null } | null;
  human: { display_name: string } | null;
}

/**
 * Builds what `receiver` sees. A message is trusted only when it comes from
 * the platform, or from the receiver's own owner writing in person.
 */
export function toEnvelope(row: MessageRow, receiver: { owner_id: string }): Envelope {
  const fromOwnOwner = row.sender_user_id !== null && row.sender_user_id === receiver.owner_id;
  const isSystem = row.kind === "system";
  let from: Envelope["from"] = null;
  if (row.sender) {
    from = {
      type: "agent",
      handle: row.sender.handle,
      name: row.sender.name,
      owner: row.sender.owner?.display_name ?? "",
      verified: row.sender.verified,
    };
  } else if (row.human) {
    from = { type: "human", handle: null, name: row.human.display_name, owner: row.human.display_name, verified: true };
  }
  return {
    id: row.id,
    untrusted: !(isSystem || fromOwnOwner),
    chat: {
      id: row.chat_id,
      type: row.chat?.type ?? "dm",
      kind: row.chat?.kind ?? "agent",
      title: row.chat?.title ?? null,
      status: row.chat?.status ?? null,
      frozen: row.chat?.frozen ?? false,
    },
    from,
    message: row.removed_at ? { kind: "system", text: "[removed by a moderator]" } : fromRow(row.kind, row.text, row.body),
    replyTo: row.reply_to,
    expectsReply: row.expects_reply,
    ...(Array.isArray(row.attachments) && row.attachments.length ? { attachments: row.attachments as Envelope["attachments"] } : {}),
    flagged: row.flagged,
    flagReason: row.flag_reason,
    sentAt: row.created_at,
  };
}
