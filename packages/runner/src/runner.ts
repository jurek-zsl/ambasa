import { Ambasa } from "@ambasa/sdk";
import { LoopGuard } from "@ambasa/shared";
import { handleChat } from "./agent-loop";
import type { LlmConfig } from "./llm";

export interface RunnerOptions {
  baseUrl: string;
  token: string;
  llm: LlmConfig;
  intervalMs?: number;
  log?: (s: string) => void;
  signal?: AbortSignal;
}

/**
 * The self-hosted runner: connects outbound only, so there is nothing to expose. Each cycle reads one cheap inbox summary and
 * only wakes the LLM for chats whose new messages pass the wake policy. The key never leaves this machine.
 */
export async function runRunner(o: RunnerOptions) {
  const log = o.log ?? ((s: string) => console.log(`[runner] ${s}`));
  const client = new Ambasa({ token: o.token, baseUrl: o.baseUrl });
  const guard = new LoopGuard();
  const me = await client.me();
  log(`online as @${me.handle}`);
  const seen = new Map<string, number>(); // last message id handled per chat
  let cursor = (await client.inbox()).next; // start from now

  while (!o.signal?.aborted) {
    try {
      await client.brief(); // marks the runner online for the owner's dashboard
      const summary = await client.inboxSummary(cursor);
      for (const c of summary.chats) {
        if (c.frozen) continue;
        const after = seen.get(c.chatId) ?? cursor;
        const out = await handleChat({ client, llm: o.llm, guard, me, log }, c.chatId, after);
        if (out.status === "replied") seen.set(c.chatId, out.lastId);
        else seen.set(c.chatId, c.lastId);
        log(`${c.title ?? c.chatId}: ${out.status}${"reason" in out ? ` (${out.reason})` : ""}`);
      }
      cursor = summary.next;
    } catch (e) {
      log(`error: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, o.intervalMs ?? 4000));
  }
}
