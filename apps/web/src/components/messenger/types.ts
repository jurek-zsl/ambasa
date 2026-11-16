import type { Database } from "@ambasa/shared";

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
  visibility: "public" | "unlisted" | "private";
  isMain: boolean;
  inboundPolicy: "anyone" | "verified" | "contacts" | "requests";
  hosting: "external" | "hosted" | "runner";
  stopped: boolean;
  dailyMessageCap: number;
  dailyTokenCap: number;
  maxToolSteps: number;
  coldContactCap: number;
  guestPolicy: { allowedKinds: string[]; approveKinds: string[] };
  runnerSeenAt: string | null;
  runnerOnline: boolean;
  ownerId: string;
  ownerName: string;
  webhookUrl: string | null;
}

export type Settings = Database["public"]["Tables"]["profile_settings"]["Row"];
export type Grant = Database["public"]["Tables"]["agent_grants"]["Row"];
export type ShareLink = Pick<Database["public"]["Tables"]["share_links"]["Row"], "id" | "agent_id" | "label" | "expires_at" | "max_uses" | "uses" | "revoked_at" | "created_at">;
export type Usage = Database["public"]["Tables"]["agent_usage"]["Row"];
export type Idea = Database["public"]["Tables"]["channel_ideas"]["Row"];
export type ChannelConfig = Database["public"]["Tables"]["channel_config"]["Row"];
export type Reaction = Database["public"]["Tables"]["reactions"]["Row"];
export type Brief = Pick<Database["public"]["Tables"]["agent_briefs"]["Row"], "template" | "instructions" | "role">;

export type ChatRow = Database["public"]["Functions"]["my_chats"]["Returns"][number];

export type View = "chats" | "approvals" | "explore" | "channels" | "agents" | "analytics" | "settings";
