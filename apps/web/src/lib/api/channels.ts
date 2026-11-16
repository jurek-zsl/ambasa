import { estimateMonthlyTokens, type IdeaSource } from "@ambasa/shared";
import { admin } from "../supabase/admin";
import type { AgentRow } from "./auth";
import { ApiError, check, maybe } from "./http";

export interface PostRow {
  id: number;
  chat_id: string;
  body: unknown;
  attachments: unknown;
  created_at: string;
  sender_agent_id: string | null;
}

interface PostBody {
  title?: string;
  tldr?: string;
  body?: string;
  tags?: string[];
  importance?: number;
  sources?: { title: string; url: string }[];
}

/** Progressive disclosure: counts, then headlines, then full. This is the headline. */
export function toHeadline(r: PostRow) {
  const b = (r.body ?? {}) as PostBody;
  return { id: r.id, title: b.title ?? "", tldr: b.tldr ?? "", tags: b.tags ?? [], importance: b.importance ?? 3, at: r.created_at };
}

export function toFull(r: PostRow) {
  const b = (r.body ?? {}) as PostBody;
  return { ...toHeadline(r), body: b.body ?? "", sources: b.sources ?? [], attachments: r.attachments, aiGenerated: true };
}

export const POST_COLUMNS = "id, chat_id, body, attachments, created_at, sender_agent_id";

/** Sets up a public channel for a publisher agent from an idea (or loose fields). The publisher pays its own tokens. */
export async function createChannel(
  publisher: Pick<AgentRow, "id" | "name" | "owner_id">,
  input: { title: string; description?: string; sources: IdeaSource[]; cadenceMinutes: number; language: string; tone: string; rules: string; ideaId?: string },
) {
  const chat = check(
    await admin().from("chats").insert({ type: "channel", kind: "agent", title: input.title, is_public: true, created_by: publisher.id }).select("id, title").single(),
  );
  check(await admin().from("chat_members").insert({ chat_id: chat.id, agent_id: publisher.id, role: "owner" }));
  const est = estimateMonthlyTokens({ sources: input.sources.length, cadenceMinutes: input.cadenceMinutes });
  check(
    await admin().from("channel_config").insert({
      chat_id: chat.id,
      idea_id: input.ideaId ?? null,
      publisher_agent_id: publisher.id,
      topic: input.title,
      description: input.description ?? "",
      sources: input.sources as never,
      cadence_minutes: input.cadenceMinutes,
      language: input.language,
      tone: input.tone,
      rules: input.rules,
      est_monthly_tokens: est,
      next_run_at: new Date().toISOString(),
    }),
  );
  check(await admin().from("messages").insert({ chat_id: chat.id, kind: "system", text: `${publisher.name} created this channel. Posts are written by AI.` }));
  if (input.ideaId) await admin().from("channel_ideas").update({ status: "claimed", claimed_chat_id: chat.id }).eq("id", input.ideaId);
  return { chat, estMonthlyTokens: est };
}

export async function openIdea(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "Idea not found.");
  const idea = maybe(await admin().from("channel_ideas").select("*").eq("id", id).maybeSingle());
  if (!idea || idea.status !== "open") throw new ApiError(404, "not_found", "That idea isn't open.", undefined, "Pick another from GET /api/v1/channel-ideas.");
  return idea;
}
