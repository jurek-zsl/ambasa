import { describe, expect, it, vi } from "vitest";
import { LoopGuard, generateVaultKeys, open, seal, type Envelope } from "@ambasa/shared";
import { handleChat } from "./agent-loop";
import { complete } from "./llm";
import { extractJson, publishOnce } from "./publisher";
import { parseFeed, sourceFeedUrl } from "./sources";
import { assertPublicUrl } from "./safe-fetch";
import { ConfigStore } from "./config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("vault", () => {
  it("seals to the public key and opens only with the private key", async () => {
    const keys = generateVaultKeys();
    const ct = seal(keys.publicKey, "sk-ant-secret");
    expect(ct).not.toContain("secret");
    expect(open(keys, ct)).toBe("sk-ant-secret");
    expect(seal(keys.publicKey, "sk-ant-secret")).not.toBe(ct); // fresh ephemeral key every time
    expect(() => open(generateVaultKeys(), ct)).toThrow();
  });
});

describe("config store", () => {
  it("encrypts at rest and rejects a wrong password", () => {
    const s = new ConfigStore(mkdtempSync(join(tmpdir(), "amb-")));
    s.save("correct horse", { baseUrl: "https://x.test", token: "ag_live_abc", llm: { provider: "openai", model: "m", apiKey: "sk-123" } });
    expect(s.load("correct horse")?.llm?.apiKey).toBe("sk-123");
    expect(s.load("wrong password")).toBeNull();
  });
});

describe("sources", () => {
  const rss = `<rss><channel><item><title>Hello &amp; welcome</title><link>https://a.test/1</link><description><![CDATA[<p>Body <b>text</b></p>]]></description><pubDate>Mon, 02 Jan 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const atom = `<feed><entry><title>v1.2.0</title><link href="https://github.com/o/r/releases/tag/v1.2.0"/><updated>2026-01-01T00:00:00Z</updated><content type="html">&lt;p&gt;Fixes&lt;/p&gt;</content></entry></feed>`;
  it("parses RSS and Atom", () => {
    expect(parseFeed(rss)[0]).toMatchObject({ title: "Hello & welcome", url: "https://a.test/1", text: "Body text" });
    expect(parseFeed(atom)[0]).toMatchObject({ title: "v1.2.0", text: "Fixes" });
  });
  it("only keeps images the source captioned in detail", () => {
    const withImg = (cap: string) => `<rss><item><title>T</title><link>https://a.test/1</link><media:content url="https://cdn.test/i.jpg"/><media:description>${cap}</media:description></item></rss>`;
    expect(parseFeed(withImg("short"))[0]!.image).toBeUndefined();
    expect(parseFeed(withImg("A photo of the new data centre with rows of racks under blue light."))[0]!.image).toBeDefined();
  });
  it("maps GitHub and subreddit sources to feeds and refuses private hosts", () => {
    expect(sourceFeedUrl({ type: "github_releases", url: "https://github.com/ggml-org/llama.cpp" })).toBe("https://github.com/ggml-org/llama.cpp/releases.atom");
    expect(sourceFeedUrl({ type: "subreddit", url: "https://www.reddit.com/r/LocalLLaMA/" })).toBe("https://www.reddit.com/r/LocalLLaMA/.rss");
    expect(() => assertPublicUrl("http://169.254.169.254/latest")).toThrow();
    expect(() => assertPublicUrl("http://localhost:3000")).toThrow();
    expect(() => assertPublicUrl("https://user:pw@example.com")).toThrow();
  });
});

describe("llm adapters", () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  it("maps Anthropic tool use and marks the brief cacheable", async () => {
    const f = ok({ content: [{ type: "text", text: "hi" }, { type: "tool_use", id: "t1", name: "send", input: { chat_id: "c" } }], usage: { input_tokens: 10, output_tokens: 5 } });
    const r = await complete({ provider: "anthropic", model: "m", apiKey: "k" }, { system: "S", messages: [{ role: "user", content: "x" }], fetch: f });
    expect(r.toolCalls[0]).toEqual({ id: "t1", name: "send", args: { chat_id: "c" } });
    expect(r.usage).toEqual({ input: 10, output: 5 });
    const sent = JSON.parse((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
    expect(sent.system[0].cache_control).toEqual({ type: "ephemeral" });
  });
  it("maps OpenAI tool calls", async () => {
    const f = ok({ choices: [{ message: { content: null, tool_calls: [{ id: "a", function: { name: "send", arguments: '{"x":1}' } }] } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
    const r = await complete({ provider: "openai", model: "m", apiKey: "k" }, { system: "S", messages: [{ role: "user", content: "x" }], fetch: f });
    expect(r.toolCalls[0]!.args).toEqual({ x: 1 });
  });
  it("surfaces provider errors", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(complete({ provider: "google", model: "m", apiKey: "k" }, { system: "S", messages: [], fetch: f })).rejects.toThrow(/401/);
  });
});

// A scripted client, enough for handleChat.
function fakeClient(messages: Envelope[], budgetOk = true) {
  const sent: unknown[] = [];
  const client = {
    messages: async () => ({ messages, next: messages.at(-1)?.id ?? 0 }),
    meWithBudget: async () => ({ budget: { ok: budgetOk } }),
    brief: async () => ({ brief: "BRIEF", limits: { maxToolSteps: 4 }, stopped: false }),
    send: async (_c: string, m: unknown) => (sent.push(m), { message: {} }),
    reportUsage: async () => ({}),
  };
  return { client: client as never, sent };
}
const env = (over: Partial<Envelope> & { text?: string }): Envelope => ({
  id: 5,
  untrusted: true,
  chat: { id: "00000000-0000-4000-8000-000000000000", type: "dm", kind: "agent", title: "t", status: null, frozen: false },
  from: { type: "agent", handle: "other", name: "Other", owner: "O", verified: true },
  message: { kind: "text", text: over.text ?? "hello" },
  replyTo: null,
  flagged: false,
  flagReason: null,
  sentAt: new Date().toISOString(),
  ...over,
});

describe("handleChat", () => {
  const llm = { provider: "openai" as const, model: "m", apiKey: "k" };
  it("replies in the chat and reports usage", async () => {
    const { client, sent } = fakeClient([env({})]);
    const completeFn = vi.fn(async () => ({ text: "Sure.", toolCalls: [], usage: { input: 10, output: 4 } }));
    const out = await handleChat({ client, llm, guard: new LoopGuard(), me: { handle: "me" }, completeFn }, "c", 0);
    expect(out).toMatchObject({ status: "replied", tokens: 14 });
    expect(sent).toHaveLength(1);
  });
  it("does not call the LLM when the wake policy says no", async () => {
    const { client } = fakeClient([env({ expectsReply: false, message: { kind: "result", title: "Done" } })]);
    const completeFn = vi.fn();
    const out = await handleChat({ client, llm, guard: new LoopGuard(), me: { handle: "me" }, completeFn: completeFn as never }, "c", 0);
    expect(out.status).toBe("skipped");
    expect(completeFn).not.toHaveBeenCalled();
  });
  it("answers busy without the LLM when the budget is spent", async () => {
    const { client, sent } = fakeClient([env({})], false);
    const completeFn = vi.fn();
    const out = await handleChat({ client, llm, guard: new LoopGuard(), me: { handle: "me" }, completeFn: completeFn as never }, "c", 0);
    expect(out.status).toBe("busy");
    expect(completeFn).not.toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ kind: "text", expectsReply: false });
  });
  it("stops at the loop guard's turn limit, and NO_REPLY sends nothing", async () => {
    const { client, sent } = fakeClient([env({})]);
    const guard = new LoopGuard({ maxTurnsPerChat: 1, burstLimit: 99, burstWindowMs: 1 });
    const completeFn = vi.fn(async () => ({ text: "NO_REPLY", toolCalls: [], usage: { input: 1, output: 1 } }));
    await handleChat({ client, llm, guard, me: { handle: "me" }, completeFn }, "c", 0);
    expect(sent).toHaveLength(0);
    const second = await handleChat({ client, llm, guard, me: { handle: "me" }, completeFn }, "c", 0);
    expect(second.status).toBe("blocked");
  });
  it("runs tool calls and feeds results back", async () => {
    const { client, sent } = fakeClient([env({})]);
    let n = 0;
    const completeFn = vi.fn(async () =>
      n++ === 0
        ? { text: "", toolCalls: [{ id: "1", name: "send", args: { chat_id: "c", kind: "text", text: "on it" } }], usage: { input: 5, output: 5 } }
        : { text: "NO_REPLY", toolCalls: [], usage: { input: 5, output: 1 } },
    );
    const out = await handleChat({ client, llm, guard: new LoopGuard(), me: { handle: "me" }, completeFn }, "c", 0);
    expect(out).toMatchObject({ status: "replied", steps: 2 });
    expect(sent[0]).toMatchObject({ kind: "text", text: "on it" });
  });
});

describe("publisher", () => {
  it("extracts JSON from wrapped model output", () => {
    expect(extractJson('Here you go:\n```json\n{"title":"T"}\n```')).toEqual({ title: "T" });
    expect(extractJson("no json")).toBeNull();
  });
  const setup = { channelId: "c", topic: "AI", sources: [{ type: "rss" as const, url: "https://a.test/feed" }], tone: "", rules: "", language: "en" };
  const llm = { provider: "openai" as const, model: "m", apiKey: "k" };
  it("posts a sourced, labeled post and skips links it already posted", async () => {
    const posted: unknown[] = [];
    const client = { channelPosts: async () => ({ posts: [{ sources: [{ url: "https://a.test/old" }] }] }), send: async (_c: string, m: unknown) => posted.push(m) } as never;
    const fetchSourceFn = async () => [
      { title: "Old", url: "https://a.test/old", text: "x", publishedAt: null },
      { title: "New", url: "https://a.test/new", text: "fresh news", publishedAt: null },
    ];
    const completeFn = vi.fn(async () => ({ text: '{"title":"New thing","tldr":"A short summary of the new thing that happened.","body":"Details.","tags":["AI"],"importance":9}', toolCalls: [], usage: { input: 100, output: 50 } }));
    const r = await publishOnce({ client, llm, completeFn, fetchSourceFn }, setup);
    expect(r.posted).toBe(true);
    expect(posted[0]).toMatchObject({ kind: "post", importance: 5, tags: ["ai"], aiGenerated: true, sources: [{ url: "https://a.test/new" }] });
  });
  it("posts nothing when there is nothing new, without calling the LLM", async () => {
    const client = { channelPosts: async () => ({ posts: [{ sources: [{ url: "https://a.test/old" }] }] }) } as never;
    const completeFn = vi.fn();
    const r = await publishOnce({ client, llm, completeFn: completeFn as never, fetchSourceFn: async () => [{ title: "Old", url: "https://a.test/old", text: "", publishedAt: null }] }, setup);
    expect(r).toMatchObject({ posted: false, reason: "nothing new" });
    expect(completeFn).not.toHaveBeenCalled();
  });
});
