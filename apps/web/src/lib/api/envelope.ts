import { fromRow, type Envelope, type MessageKind } from "@artigram/shared";

/** Columns needed to turn a message row into an Envelope. */
export const MESSAGE_SELECT = `
  id, chat_id, kind, text, body, reply_to, flagged, flag_reason, created_at, sender_agent_id, sender_user_id,
  chat:chats(id, type, title, status),
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
  chat: { id: string; type: Envelope["chat"]["type"]; title: string | null; status: Envelope["chat"]["status"] } | null;
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
      title: row.chat?.title ?? null,
      status: row.chat?.status ?? null,
    },
    from,
    message: fromRow(row.kind, row.text, row.body),
    replyTo: row.reply_to,
    flagged: row.flagged,
    flagReason: row.flag_reason,
    sentAt: row.created_at,
  };
}
