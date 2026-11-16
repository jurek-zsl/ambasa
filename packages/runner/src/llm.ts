/**
 * One small interface over three LLM APIs, using plain fetch (no provider SDKs). The owner's key, model and
 * base URL come from the vault (hosted) or the environment (self-hosted). Ambasa pays for none of it.
 */
export type Provider = "anthropic" | "openai" | "openai_compatible" | "google";

export interface LlmConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the arguments (an object). Keep it simple: some providers reject exotic keywords. */
  schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface LlmResult {
  text: string;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
}

export interface CompleteInput {
  system: string;
  messages: LlmMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export class LlmError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export async function complete(cfg: LlmConfig, input: CompleteInput): Promise<LlmResult> {
  switch (cfg.provider) {
    case "anthropic":
      return anthropic(cfg, input);
    case "openai":
    case "openai_compatible":
      return openai(cfg, input);
    case "google":
      return google(cfg, input);
  }
}

async function post(f: typeof fetch, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const res = await f(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(90_000) });
  const text = await res.text();
  if (!res.ok) throw new LlmError(res.status, `LLM request failed (${res.status}): ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch {
    throw new LlmError(502, "LLM returned something that isn't JSON.");
  }
}

// ---------------------------------------------------------------- Anthropic
async function anthropic(cfg: LlmConfig, i: CompleteInput): Promise<LlmResult> {
  const messages: { role: "user" | "assistant"; content: unknown[] | string }[] = [];
  for (const m of i.messages) {
    if (m.role === "user") messages.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const t of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: t.id, name: t.name, input: t.args });
      messages.push({ role: "assistant", content: blocks });
    } else {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      const last = messages.at(-1);
      if (last?.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else messages.push({ role: "user", content: [block] });
    }
  }
  const data = await post(
    i.fetch ?? fetch,
    `${(cfg.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`,
    { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    {
      model: cfg.model,
      max_tokens: i.maxTokens ?? 1024,
      // The brief is stable across turns: mark it cacheable so repeated wake-ups cost less.
      system: [{ type: "text", text: i.system, cache_control: { type: "ephemeral" } }],
      messages,
      ...(i.tools?.length ? { tools: i.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })) } : {}),
    },
    i.signal,
  );
  const blocks = (data.content ?? []) as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim(),
    toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id!, name: b.name!, args: b.input ?? {} })),
    usage: {
      input: (data.usage?.input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0),
      output: data.usage?.output_tokens ?? 0,
    },
  };
}

// ---------------------------------------------------------------- OpenAI and compatible servers
async function openai(cfg: LlmConfig, i: CompleteInput): Promise<LlmResult> {
  const messages: unknown[] = [{ role: "system", content: i.system }];
  for (const m of i.messages) {
    if (m.role === "user") messages.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      messages.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } })) } : {}),
      });
    } else messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
  }
  const limitKey = cfg.provider === "openai" ? "max_completion_tokens" : "max_tokens";
  const data = await post(
    i.fetch ?? fetch,
    `${(cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/chat/completions`,
    { Authorization: `Bearer ${cfg.apiKey}` },
    {
      model: cfg.model,
      messages,
      [limitKey]: i.maxTokens ?? 1024,
      ...(i.tools?.length ? { tools: i.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } })) } : {}),
    },
    i.signal,
  );
  const msg = data.choices?.[0]?.message ?? {};
  const calls = (msg.tool_calls ?? []) as { id: string; function: { name: string; arguments: string } }[];
  return {
    text: String(msg.content ?? "").trim(),
    toolCalls: calls.map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) })),
    usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
  };
}

// ---------------------------------------------------------------- Google
async function google(cfg: LlmConfig, i: CompleteInput): Promise<LlmResult> {
  const contents: { role: "user" | "model"; parts: unknown[] }[] = [];
  for (const m of i.messages) {
    if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content }] });
    else if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const t of m.toolCalls ?? []) parts.push({ functionCall: { name: t.name, args: t.args } });
      contents.push({ role: "model", parts });
    } else {
      const part = { functionResponse: { name: m.name, response: { result: m.content } } };
      const last = contents.at(-1);
      if (last?.role === "user" && last.parts.every((p) => "functionResponse" in (p as object))) last.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    }
  }
  const data = await post(
    i.fetch ?? fetch,
    `${(cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "")}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: i.system }] },
      contents,
      generationConfig: { maxOutputTokens: i.maxTokens ?? 1024 },
      ...(i.tools?.length ? { tools: [{ functionDeclarations: i.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.schema })) }] } : {}),
    },
    i.signal,
  );
  const parts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[];
  let n = 0;
  return {
    text: parts.map((p) => p.text ?? "").join("").trim(),
    toolCalls: parts.filter((p) => p.functionCall).map((p) => ({ id: `call_${++n}`, name: p.functionCall!.name, args: p.functionCall!.args ?? {} })),
    usage: { input: data.usageMetadata?.promptTokenCount ?? 0, output: data.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
