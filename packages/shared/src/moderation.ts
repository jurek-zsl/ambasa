import { z } from "zod";
import { sourceSchema } from "./messages";

/**
 * First-line screening for public content: channel ideas and outgoing posts. It catches spam and link
 * stuffing and obvious abuse; reports and takedowns (admin) handle the rest.
 */
const BLOCKED: { reason: string; re: RegExp }[] = [
  { reason: "Looks like a scam or fake-engagement offer", re: /\b(buy|get|free)\b[^.\n]{0,30}\b(followers|likes|subscribers|crypto giveaway|airdrop)\b|\bguaranteed (profit|returns?)\b/i },
  { reason: "Looks like a phishing or credential request", re: /\b(verify|confirm|update)\b[^.\n]{0,30}\b(your )?(password|wallet|seed phrase|bank account)\b/i },
  { reason: "Promotes malware or hacking of others", re: /\b(ransomware|keylogger|credential stuffing|ddos[- ]for[- ]hire)\b/i },
  { reason: "Sexual content involving minors", re: /\b(child|minor|underage)\b[^.\n]{0,30}\b(porn|sexual|nude|explicit)\b/i },
];

export interface Screening {
  ok: boolean;
  reason: string | null;
}

const LINK = /https?:\/\/[^\s)]+/gi;

/** Rejects text that is mostly links, shouts, or repeats itself. */
export function screenText(text: string, opts: { maxLinks?: number } = {}): Screening {
  for (const b of BLOCKED) if (b.re.test(text)) return { ok: false, reason: b.reason };
  const links = text.match(LINK) ?? [];
  const maxLinks = opts.maxLinks ?? Math.max(3, Math.floor(text.length / 250));
  if (links.length > maxLinks) return { ok: false, reason: "Too many links for this much text" };
  if (/(.)\1{14,}/.test(text)) return { ok: false, reason: "Repeated characters" };
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 40 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) {
    return { ok: false, reason: "Mostly capital letters" };
  }
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length > 30 && new Set(words).size / words.length < 0.25) return { ok: false, reason: "Repetitive text" };
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------- channel ideas
export const SOURCE_TYPES = ["rss", "url", "github_releases", "subreddit"] as const;
export const ideaSourceSchema = z.object({
  type: z.enum(SOURCE_TYPES),
  url: z.url({ protocol: /^https?$/ }),
});
export type IdeaSource = z.infer<typeof ideaSourceSchema>;

export const channelIdeaSchema = z.object({
  topic: z.string().trim().min(3).max(120),
  sources: z.array(ideaSourceSchema).min(1).max(20),
  cadenceMinutes: z.number().int().min(15).max(10080).default(1440),
  language: z.string().trim().min(2).max(12).default("en"),
  tone: z.string().trim().max(200).default(""),
  rules: z.string().trim().max(1000).default(""),
});
export type ChannelIdea = z.infer<typeof channelIdeaSchema>;

export function screenIdea(idea: ChannelIdea): Screening {
  const t = screenText([idea.topic, idea.tone, idea.rules].join("\n"), { maxLinks: 0 });
  if (!t.ok) return t;
  for (const s of idea.sources) {
    const host = new URL(s.url).hostname;
    if (/^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(host)) {
      return { ok: false, reason: "Sources must be public websites" };
    }
  }
  return { ok: true, reason: null };
}

/** Filters an outgoing post before it is published. */
export function screenPost(post: { title: string; tldr: string; body: string; sources: z.infer<typeof sourceSchema>[] }): Screening {
  const t = screenText([post.title, post.tldr, post.body].join("\n"), { maxLinks: Math.max(post.sources.length + 3, 5) });
  if (!t.ok) return t;
  if (post.body.length > 0 && post.body.length > 6000) return { ok: false, reason: "Post is too long; summarize and link instead" };
  return { ok: true, reason: null };
}
