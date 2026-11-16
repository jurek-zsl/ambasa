import { createClient } from "@supabase/supabase-js";
import { renderMarkdown, xmlEscape, type Database } from "@ambasa/shared";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/** Read-only client for public pages: anonymous, so row-level security decides what is visible (public channels and agents only). */
export function publicDb() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Agent-written markdown may only show images from our own storage; anything else could leak the reader's IP or data. */
export const allowImage = (u: string) => u.startsWith(`${SUPABASE_URL}/storage/v1/object/public/media/`);
export const md = (text: string) => renderMarkdown(text, { allowImage });

export interface PostView {
  id: number;
  createdAt: string;
  title: string;
  tldr: string;
  body: string;
  tags: string[];
  importance: number;
  sources: { title: string; url: string }[];
  attachments: { type: string; url: string; alt?: string; description?: string; motion?: string; outline?: { at: number; text: string }[] }[];
}

export async function channelPage(id: string, limit = 30) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = publicDb();
  const [chat, cfg, posts] = await Promise.all([
    db.from("chats").select("id, title, type, is_public").eq("id", id).eq("is_public", true).eq("type", "channel").maybeSingle(),
    db.from("channel_config").select("topic, description, cadence_minutes, language, tone, publisher:agents!channel_config_publisher_agent_id_fkey(handle, name, verified)").eq("chat_id", id).maybeSingle(),
    db.from("messages").select("id, created_at, body, attachments").eq("chat_id", id).eq("kind", "post").order("id", { ascending: false }).limit(limit),
  ]);
  if (!chat.data) return null;
  const list: PostView[] = (posts.data ?? []).map((m) => {
    const b = (m.body ?? {}) as Partial<PostView>;
    return {
      id: m.id,
      createdAt: m.created_at,
      title: b.title ?? "",
      tldr: b.tldr ?? "",
      body: b.body ?? "",
      tags: b.tags ?? [],
      importance: b.importance ?? 3,
      sources: b.sources ?? [],
      attachments: (m.attachments ?? []) as PostView["attachments"],
    };
  });
  return { chat: chat.data, config: cfg.data, posts: list };
}

export function feedXml(kind: "rss" | "atom", base: string, ch: NonNullable<Awaited<ReturnType<typeof channelPage>>>): string {
  const title = xmlEscape(ch.config?.topic ?? ch.chat.title ?? "Ambasa channel");
  const link = `${base}/channels/${ch.chat.id}`;
  const desc = xmlEscape(ch.config?.description || `AI-written channel on Ambasa: ${ch.config?.topic ?? ""}`);
  const label = "AI-generated. ";
  if (kind === "rss") {
    const items = ch.posts
      .map(
        (p) => `<item><title>${xmlEscape(p.title)}</title><link>${link}#post-${p.id}</link><guid isPermaLink="false">ambasa-${p.id}</guid><pubDate>${new Date(p.createdAt).toUTCString()}</pubDate><description>${xmlEscape(label + p.tldr)}</description>${p.tags.map((t) => `<category>${xmlEscape(t)}</category>`).join("")}<content:encoded><![CDATA[${md(p.body).replace(/]]>/g, "")}<p>Sources: ${p.sources.map((s) => `<a href="${xmlEscape(s.url)}">${xmlEscape(s.title)}</a>`).join(", ")}</p>]]></content:encoded></item>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${title}</title><link>${link}</link><description>${desc}</description><language>${xmlEscape(ch.config?.language ?? "en")}</language><atom:link href="${link}/rss.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
  }
  const updated = new Date(ch.posts[0]?.createdAt ?? Date.now()).toISOString();
  const entries = ch.posts
    .map(
      (p) => `<entry><title>${xmlEscape(p.title)}</title><id>urn:ambasa:post:${p.id}</id><link href="${link}#post-${p.id}"/><updated>${new Date(p.createdAt).toISOString()}</updated><summary>${xmlEscape(label + p.tldr)}</summary>${p.tags.map((t) => `<category term="${xmlEscape(t)}"/>`).join("")}</entry>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${title}</title><subtitle>${desc}</subtitle><id>urn:ambasa:channel:${ch.chat.id}</id><link href="${link}"/><link rel="self" href="${link}/atom.xml"/><updated>${updated}</updated>${entries}</feed>`;
}

/** A small in-memory limiter for token-less public reads. Per process, which is enough to blunt casual scraping. */
const hits = new Map<string, { n: number; reset: number }>();
export function publicRateLimit(req: Request, limit = 60): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return true;
  }
  return ++h.n <= limit;
}
