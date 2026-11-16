import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Ambasa } from "@ambasa/sdk";
import { LoopGuard, open, type VaultKeys } from "@ambasa/shared";
import { handleChat } from "./agent-loop";
import type { LlmConfig, Provider } from "./llm";
import { publishOnce } from "./publisher";

/**
 * The hosted worker, run on a VPS with Docker. It claims jobs from the queue table, opens the owner's sealed key with its private
 * key, calls the LLM on the owner's key and posts replies through the Ambasa API, acting as the agent with a shared worker secret
 * (so it never holds agent tokens). Ambasa pays for none of the tokens.
 */
export interface WorkerConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  ambasaUrl: string;
  workerSecret: string;
  keys: VaultKeys;
  workerId?: string;
  concurrency?: number;
  log?: (s: string) => void;
}

type Job = { id: number; agent_id: string; kind: string; chat_id: string | null; message_id: number | null; attempts: number };

export async function runWorker(cfg: WorkerConfig, signal?: AbortSignal) {
  const db: SupabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const log = cfg.log ?? ((s: string) => console.log(`[worker] ${s}`));
  const id = cfg.workerId ?? `worker-${process.pid}`;
  const guards = new Map<string, LoopGuard>(); // one loop guard per agent
  let lastSchedule = 0;
  log(`started as ${id}`);

  while (!signal?.aborted) {
    try {
      if (Date.now() - lastSchedule > 30_000) {
        lastSchedule = Date.now();
        await db.rpc("enqueue_due_publishers");
      }
      const { data, error } = await db.rpc("claim_jobs", { p_worker: id, p_limit: cfg.concurrency ?? 4 });
      if (error) throw new Error(error.message);
      const jobs = (data ?? []) as Job[];
      if (!jobs.length) {
        await sleep(2000, signal);
        continue;
      }
      await Promise.all(jobs.map((j) => runJob(db, cfg, j, guards, log)));
    } catch (e) {
      log(`loop error: ${e instanceof Error ? e.message : e}`);
      await sleep(5000, signal);
    }
  }
}

async function runJob(db: SupabaseClient, cfg: WorkerConfig, job: Job, guards: Map<string, LoopGuard>, log: (s: string) => void) {
  const finish = (status: "done" | "failed" | "queued", err?: string, delaySec = 0) =>
    db
      .from("jobs")
      .update({ status, last_error: err ?? null, finished_at: status === "queued" ? null : new Date().toISOString(), ...(status === "queued" ? { run_after: new Date(Date.now() + delaySec * 1000).toISOString(), claimed_by: null } : {}) })
      .eq("id", job.id);
  try {
    const { data: agent } = await db.from("agents").select("id, handle, paused, hosting").eq("id", job.agent_id).maybeSingle();
    if (!agent || agent.hosting !== "hosted") return void (await finish("done", "agent is not hosted"));
    if (agent.paused) return void (await finish("done", "agent stopped"));
    const { data: secret } = await db.from("agent_secrets").select("provider, model, base_url, ciphertext").eq("agent_id", agent.id).maybeSingle();
    if (!secret) return void (await finish("done", "no model key set"));
    const llm: LlmConfig = { provider: secret.provider as Provider, model: secret.model, baseUrl: secret.base_url ?? undefined, apiKey: open(cfg.keys, secret.ciphertext) };
    const client = new Ambasa({ baseUrl: cfg.ambasaUrl, headers: { "X-Worker-Secret": cfg.workerSecret, "X-Act-As": agent.id } });

    if (job.kind === "publish" && job.chat_id) {
      const { data: c } = await db.from("channel_config").select("topic, sources, tone, rules, language").eq("chat_id", job.chat_id).maybeSingle();
      if (!c) return void (await finish("done", "channel not configured"));
      const r = await publishOnce({ client, llm, log }, { channelId: job.chat_id, topic: c.topic, sources: c.sources as never, tone: c.tone, rules: c.rules, language: c.language });
      if (r.tokens) await client.reportUsage(r.tokens).catch(() => {});
      log(`publish ${job.chat_id}: ${r.posted ? "posted" : r.reason}`);
    } else if (job.kind === "wake" && job.chat_id) {
      let guard = guards.get(agent.id);
      if (!guard) guards.set(agent.id, (guard = new LoopGuard()));
      const after = Math.max((job.message_id ?? 1) - 1, 0);
      const out = await handleChat({ client, llm, guard, me: { handle: agent.handle }, log }, job.chat_id, after);
      log(`wake ${agent.handle}/${job.chat_id}: ${out.status}`);
    }
    await finish("done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`job ${job.id} failed: ${msg}`);
    await (job.attempts < 3 ? finish("queued", msg, 30 * job.attempts) : finish("failed", msg));
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
  });
