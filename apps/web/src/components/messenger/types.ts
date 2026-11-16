import type { Database } from "@ambasa/shared";

type Tables = Database["public"]["Tables"];
export type ChatType = Database["public"]["Enums"]["chat_type"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type Msg = Tables["messages"]["Row"];
export type Approval = Tables["approvals"]["Row"];
export type Member = Pick<
  Tables["chat_members"]["Row"],
  "chat_id" | "agent_id" | "role" | "paused"
>;
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
export type ShareLink = Pick<
  Database["public"]["Tables"]["share_links"]["Row"],
  | "id"
  | "agent_id"
  | "label"
  | "expires_at"
  | "max_uses"
  | "uses"
  | "revoked_at"
  | "created_at"
>;
export type Usage = Database["public"]["Tables"]["agent_usage"]["Row"];
export type Idea = Database["public"]["Tables"]["channel_ideas"]["Row"];
export type ChannelConfig =
  Database["public"]["Tables"]["channel_config"]["Row"];
export type Reaction = Database["public"]["Tables"]["reactions"]["Row"];
export type Brief = Pick<
  Database["public"]["Tables"]["agent_briefs"]["Row"],
  "template" | "instructions" | "role"
>;

type RpcChat = Database["public"]["Functions"]["my_chats"]["Returns"][number];
// SQL function result types omit nullability; use the underlying table contract for nullable fields.
export type ChatRow = Omit<
  RpcChat,
  | "title"
  | "status"
  | "goal"
  | "frozen_reason"
  | "request_state"
  | "request_to"
  | "last_kind"
  | "last_text"
  | "last_sender_agent_id"
  | "last_sender_user_id"
> &
  Pick<
    Tables["chats"]["Row"],
    | "title"
    | "status"
    | "goal"
    | "frozen_reason"
    | "request_state"
    | "request_to"
  > & {
    last_kind: Msg["kind"] | null;
    last_text: string | null;
    last_sender_agent_id: string | null;
    last_sender_user_id: string | null;
  };

export type Preset = Tables["task_presets"]["Row"];
export type ReadingState = Tables["owner_channel_state"]["Row"];
export type ModelUsage = Tables["model_usage"]["Row"];
export type ModelRate = Tables["model_rates"]["Row"];
export type ChannelPreview =
  Database["public"]["Functions"]["owner_channel_previews"]["Returns"][number];
export interface Workspace {
  previews: ChannelPreview[];
  presets: Preset[];
  reading: ReadingState[];
  checks: Tables["agent_checks"]["Row"][];
  modelUsage: ModelUsage[];
  rates: ModelRate[];
}
export interface Readiness {
  key: { provider: string; model: string; hint: string } | null;
  check: Tables["agent_checks"]["Row"] | null;
  online: boolean;
  stopped: boolean;
  budgetExhausted: boolean;
  failed: { id: number; at: string; detail: string } | null;
}

export type View =
  | "tasks"
  | "more"
  | "chats"
  | "approvals"
  | "explore"
  | "channels"
  | "agents"
  | "analytics"
  | "settings";
