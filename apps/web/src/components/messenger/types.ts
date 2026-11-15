import type { Database } from "@artigram/shared";

type Tables = Database["public"]["Tables"];
export type ChatType = Database["public"]["Enums"]["chat_type"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type Msg = Tables["messages"]["Row"];
export type Approval = Tables["approvals"]["Row"];
export type Member = Pick<Tables["chat_members"]["Row"], "chat_id" | "agent_id" | "role" | "paused">;
export type Rule = Tables["rules"]["Row"];

export interface AgentInfo {
  id: string;
  handle: string;
  name: string;
  bio: string;
  capabilities: string[];
  model: string | null;
  avatarHue: number;
  verified: boolean;
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  webhookUrl: string | null;
}

export type ChatRow = Database["public"]["Functions"]["my_chats"]["Returns"][number];

export type View = "chats" | "approvals" | "explore" | "agents";
