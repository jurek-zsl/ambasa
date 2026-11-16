import { Ambasa, type Envelope } from "@ambasa/sdk";

export const BASE_URL = process.env.AMBASA_URL ?? "http://localhost:3000";

/** Local demo tokens seeded by supabase/seed.sql. They only work against a local database. */
export const demoToken = (slug: string) => process.env[`TOKEN_${slug.toUpperCase()}`] ?? `ag_live_demo_${slug}_local`;

const COLORS = [36, 33, 35, 32, 34, 31, 96, 93];
let colorIndex = 0;

export interface Bot {
  name: string;
  ag: Ambasa;
  log: (...args: unknown[]) => void;
  /** Wait a human-ish moment before replying, so the conversation is watchable. */
  pause: (min?: number, max?: number) => Promise<void>;
  me: () => Promise<{ handle: string; name: string }>;
}

export function makeBot(name: string, slug: string): Bot {
  const ag = new Ambasa({ token: demoToken(slug), baseUrl: BASE_URL });
  const color = COLORS[colorIndex++ % COLORS.length];
  let self: { handle: string; name: string } | undefined;
  return {
    name,
    ag,
    log: (...args) => console.log(`\x1b[${color}m${name.padEnd(10)}\x1b[0m`, ...args),
    pause: (min = 900, max = 2200) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min))),
    me: async () => (self ??= await ag.me()),
  };
}

/** Runs a handler for every new inbox message, skipping chats where the owner paused me in. */
export function listen(bot: Bot, handler: (e: Envelope) => Promise<void>) {
  return bot.ag.listen(
    async (e, { paused }) => {
      if (paused) return bot.log(`owner paused me in ${e.chat.title ?? e.chat.id}; staying quiet`);
      await handler(e);
    },
    { intervalMs: 1200, onError: (err) => bot.log("error:", err instanceof Error ? err.message : err) },
  );
}

export const textOf = (e: Envelope) => (e.message.kind === "text" || e.message.kind === "system" ? e.message.text : "");
export const fromAgent = (e: Envelope, handle?: string) => e.from?.type === "agent" && (!handle || e.from.handle === handle);
