import type { Ambasa } from "@ambasa/sdk";
import { AmbasaError } from "@ambasa/sdk";
import {
  BUSY_REPLY,
  LoopGuard,
  outgoingMessageSchema,
  wakeDecision,
  type Envelope,
} from "@ambasa/shared";
import {
  complete as realComplete,
  type LlmConfig,
  type LlmMessage,
  type LlmResult,
  type ToolDef,
} from "./llm";
import { renderConversation } from "./render";

/** The tools every agent gets. Few and short on purpose: tool definitions are re-sent on every turn. */
export const TOOLS: ToolDef[] = [
  {
    name: "search_directory",
    description: "Find public agents by what they do.",
    schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "start_chat",
    description:
      "Open a chat with an agent for a goal (a task or DM). Only when your owner's request needs it.",
    schema: {
      type: "object",
      properties: {
        handle: { type: "string" },
        goal: { type: "string" },
        title: { type: "string" },
        type: { type: "string", enum: ["dm", "task"] },
      },
      required: ["handle", "goal"],
    },
  },
  {
    name: "send",
    description:
      "Send a message. kind: text | request | offer | counter_offer | result. Use result to close things out.",
    schema: {
      type: "object",
      properties: {
        chat_id: { type: "string" },
        kind: {
          type: "string",
          enum: ["text", "request", "offer", "counter_offer", "result"],
        },
        text: { type: "string" },
        title: { type: "string" },
        note: { type: "string" },
        price: { type: "string" },
        fields: { type: "object" },
        items: { type: "array", items: { type: "string" } },
        in_reply_to: { type: "integer" },
      },
      required: ["chat_id", "kind"],
    },
  },
  {
    name: "request_approval",
    description:
      "Ask your owner before paying, sharing contact details or accepting terms. Then stop; you'll be woken with the answer.",
    schema: {
      type: "object",
      properties: {
        chat_id: { type: "string" },
        title: { type: "string" },
        reason: { type: "string" },
        fields: { type: "object" },
      },
      required: ["chat_id", "title", "reason"],
    },
  },
  {
    name: "read_chat",
    description: "Recent messages of a chat.",
    schema: {
      type: "object",
      properties: { chat_id: { type: "string" }, limit: { type: "integer" } },
      required: ["chat_id"],
    },
  },
  {
    name: "channels",
    description:
      "Channels. action: search (query) | join (channel_id) | updates (counts) | read (channel_id, view headlines|full) | ack (subscription_id).",
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "join", "updates", "read", "ack"],
        },
        query: { type: "string" },
        channel_id: { type: "string" },
        subscription_id: { type: "string" },
        view: { type: "string", enum: ["headlines", "full"] },
      },
      required: ["action"],
    },
  },
  {
    name: "update_task",
    description: "Set the status of a task you opened.",
    schema: {
      type: "object",
      properties: {
        chat_id: { type: "string" },
        status: { type: "string", enum: ["open", "done", "failed", "paused"] },
      },
      required: ["chat_id", "status"],
    },
  },
];

/** Main Agent tools are management-only; it never opens conversations with outsiders. */
export const MAIN_TOOLS: ToolDef[] = [
  ...TOOLS.filter((t) => ["send", "read_chat"].includes(t.name)),
  {
    name: "manage_agents",
    description:
      "Manage your owner's specialists. action: list, create (params), update (handle, changes), delegate (handle, goal), summary. Changes may require approval; stop when pending. Hosted specialists reuse your model connection. Never claim execution until a result is received.",
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "update", "delegate", "summary"],
        },
        handle: { type: "string" },
        goal: { type: "string" },
        params: { type: "object" },
        changes: { type: "object" },
      },
      required: ["action"],
    },
  },
];

export interface TurnDeps {
  client: Ambasa;
  llm: LlmConfig;
  guard: LoopGuard;
  me: { handle: string };
  log?: (line: string) => void;
  /** For tests. */
  completeFn?: (
    cfg: LlmConfig,
    input: Parameters<typeof realComplete>[1],
  ) => Promise<LlmResult>;
}

export type TurnOutcome =
  | { status: "skipped"; reason: string }
  | { status: "busy" }
  | { status: "blocked"; reason: string }
  | { status: "replied"; steps: number; tokens: number; lastId: number };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Runs one tool call and returns a short text result for the model. */
export async function runTool(
  deps: TurnDeps,
  name: string,
  a: Record<string, unknown>,
): Promise<string> {
  const { client } = deps;
  try {
    switch (name) {
      case "manage_agents": {
        if (a.action === "list")
          return JSON.stringify(await client.main.agents());
        if (a.action === "summary")
          return JSON.stringify(await client.main.summary());
        const result =
          a.action === "create"
            ? await client.main.createAgent(a.params as Record<string, unknown>)
            : a.action === "update"
              ? await client.main.updateAgent(
                  str(a.handle),
                  a.changes as Record<string, unknown>,
                )
              : a.action === "delegate"
                ? await client.main.delegate(str(a.handle), str(a.goal))
                : null;
        if (!result) return "Unknown management action.";
        return result.status === "pending_approval"
          ? `Approval ${result.approvalId} requested. Stop and wait for the owner.`
          : JSON.stringify(result);
      }
      case "search_directory": {
        const list = await client.directory(str(a.query), 8);
        return list.length
          ? list
              .map(
                (x) =>
                  `@${x.handle} ${x.name}${x.verified ? " ✓" : ""}: ${x.bio.slice(0, 100)}`,
              )
              .join("\n")
          : "No agents found.";
      }
      case "start_chat": {
        const chat = await client.createChat({
          type: a.type === "dm" ? "dm" : "task",
          with: [str(a.handle)],
          title: str(a.title) || `Task with @${str(a.handle)}`,
          goal: str(a.goal),
        });
        return `Opened ${chat.type} ${chat.id}${chat.reused ? " (existing)" : ""}.`;
      }
      case "send": {
        const { chat_id, in_reply_to, ...rest } = a;
        const raw =
          rest.kind === "text"
            ? { kind: "text", text: str(rest.text) }
            : {
                ...rest,
                fields: rest.fields ?? {},
                ...(in_reply_to ? { inReplyTo: in_reply_to } : {}),
              };
        const parsed = outgoingMessageSchema.safeParse(raw);
        if (!parsed.success)
          return `Not sent: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
        await client.send(
          str(chat_id),
          parsed.data,
          in_reply_to ? { replyTo: Number(in_reply_to) } : {},
        );
        return "Sent.";
      }
      case "request_approval": {
        const r = await client.requestApproval(str(a.chat_id), {
          title: str(a.title),
          reason: str(a.reason),
          fields: (a.fields as Record<string, string>) ?? {},
        });
        return `Approval ${r.approvalId} requested. Stop now; you will be woken with the answer. Do not act before it.`;
      }
      case "read_chat": {
        const { messages } = await client.messages(str(a.chat_id), {
          limit: Math.min(Number(a.limit) || 15, 40),
        });
        return (
          messages
            .map(
              (m) =>
                `#${m.id} ${m.from?.handle ?? m.from?.type ?? "platform"}: ${JSON.stringify(m.message).slice(0, 400)}`,
            )
            .join("\n") || "Empty."
        );
      }
      case "channels": {
        switch (a.action) {
          case "search":
            return (
              (await client.channels(str(a.query)))
                .map((c) => `${c.id} ${c.topic} (every ${c.cadenceMinutes}m)`)
                .join("\n") || "None."
            );
          case "join":
            await client.join(str(a.channel_id));
            return "Subscribed (headlines).";
          case "updates": {
            const u = await client.channelUpdates();
            return (
              u.channels
                .map(
                  (c) =>
                    `${c.title ?? c.chatId}: ${c.newPosts} new, top importance ${c.topImportance} [sub ${c.subscriptionId}, chat ${c.chatId}]`,
                )
                .join("\n") || "Nothing new."
            );
          }
          case "read": {
            const r = await client.channelPosts(str(a.channel_id), {
              view: a.view === "full" ? "full" : "headlines",
              limit: 10,
            });
            return (
              r.posts
                .map((p) => `#${p.id} [${p.importance}] ${p.title} — ${p.tldr}`)
                .join("\n") || "Nothing new."
            );
          }
          case "ack":
            await client.ack(str(a.subscription_id));
            return "Marked read.";
        }
        return "Unknown action.";
      }
      case "update_task":
        await client.updateTask(
          str(a.chat_id),
          a.status as "open" | "done" | "failed" | "paused",
        );
        return `Task ${str(a.status)}.`;
      default:
        return `Unknown tool ${name}.`;
    }
  } catch (e) {
    if (e instanceof AmbasaError)
      return `Error ${e.code}: ${e.message}${e.hint ? ` (${e.hint})` : ""}`;
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Handles new messages in one chat. The order is the point: the cheap checks (wake policy, budget, loop guard)
 * all run before a single token is spent.
 */
export async function handleChat(
  deps: TurnDeps,
  chatId: string,
  afterId: number,
): Promise<TurnOutcome> {
  const { client, me, guard, log = () => {} } = deps;
  const { messages: page } = await client.messages(chatId, {
    after: afterId,
    limit: 50,
  });
  const fresh = page.filter((m) => m.from?.handle !== me.handle);
  if (!fresh.length) return { status: "skipped", reason: "nothing new" };
  const lastId = page.at(-1)!.id;

  const decisions = fresh.map((m) => ({ m, d: wakeDecision(m, me) }));
  const waking = decisions.filter((x) => x.d.wake);
  if (!waking.length)
    return { status: "skipped", reason: decisions[0]!.d.reason };
  const ownerWrote = waking.some((x) => x.m.from?.type === "human");
  const ownerChat = fresh[0]!.chat.kind === "owner";

  const { budget, agent: identity } = await client.meWithBudget();
  if (!budget.ok) {
    // Out of budget: say so without calling the LLM.
    if (!ownerChat)
      await client
        .send(chatId, { kind: "text", text: BUSY_REPLY, expectsReply: false })
        .catch(() => {});
    return { status: "busy" };
  }
  const gate = guard.check(chatId, ownerWrote);
  if (!gate.ok) {
    log(`loop guard: ${gate.reason} (${chatId})`);
    return { status: "blocked", reason: gate.reason };
  }

  const brief = await client.brief(chatId);
  if (brief.stopped)
    return { status: "skipped", reason: "agent stopped by owner" };
  const { messages: history } = await client.messages(chatId, { limit: 30 });
  const llmMessages: LlmMessage[] = [
    { role: "user", content: renderConversation(history, fresh) },
  ];
  const complete = deps.completeFn ?? realComplete;

  let tokens = 0;
  let steps = 0;
  const maxSteps = Math.min(brief.limits.maxToolSteps, 12);
  let stop = false;
  while (steps < maxSteps && !stop) {
    steps++;
    const res = await complete(deps.llm, {
      system: brief.brief,
      messages: llmMessages,
      tools: identity?.isMain ? MAIN_TOOLS : TOOLS,
      maxTokens: 1024,
    });
    tokens += res.usage.input + res.usage.output;
    // Record each completed model call before tools execute, including turns that later fail.
    await client
      .reportUsage(res.usage.input + res.usage.output, 1, {
        inputTokens: res.usage.input,
        outputTokens: res.usage.output,
        provider: deps.llm.provider,
        model: deps.llm.model,
        chatId,
      })
      .catch(() => {});
    if (!res.toolCalls.length) {
      const text = res.text.trim();
      if (text && !/^NO_REPLY\b/i.test(text)) {
        await client.send(chatId, {
          kind: "text",
          text: text.slice(0, 7900),
          expectsReply: ownerChat ? false : undefined,
        });
      }
      break;
    }
    llmMessages.push({
      role: "assistant",
      content: res.text,
      toolCalls: res.toolCalls,
    });
    for (const call of res.toolCalls) {
      const out = await runTool(deps, call.name, call.args);
      llmMessages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: out,
      });
      if (
        (call.name === "request_approval" || call.name === "manage_agents") &&
        out.startsWith("Approval")
      ) {
        stop = true;
        break;
      }
    }
  }
  if (steps >= maxSteps && !stop) log(`step limit reached in ${chatId}`);

  guard.record(chatId);
  return { status: "replied", steps, tokens, lastId };
}

export function fresh(messages: Envelope[], me: { handle: string }) {
  return messages.filter((m) => m.from?.handle !== me.handle);
}
