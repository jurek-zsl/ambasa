import { assertPublicUrl, safeFetch } from "./safe-fetch";

/** One item found at a source. Plain code fetches and extracts these; the LLM only summarizes them. */
export interface SourceItem {
  title: string;
  url: string;
  text: string;
  publishedAt: string | null;
  /** An image the source itself captioned, if any. We never describe media ourselves. */
  image?: { url: string; caption: string };
}

export interface SourceSpec {
  type: "rss" | "url" | "github_releases" | "subreddit";
  url: string;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return entities[e.toLowerCase()] ?? m;
    });
}

export function stripTags(html: string): string {
  return decode(
    decode(html)
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1]!).trim() : "";
};
const attr = (block: string, name: string, a: string) => {
  const m = new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`, "i").exec(block);
  return m ? decode(m[1]!) : "";
};

/** RSS 2.0 and Atom. A regex parser is enough for the fields we need and avoids an XML dependency. */
export function parseFeed(xml: string, limit = 10): SourceItem[] {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? [];
  const items: SourceItem[] = [];
  for (const b of blocks.slice(0, limit)) {
    const title = stripTags(tag(b, "title"));
    const link = tag(b, "link") || attr(b, "link", "href") || tag(b, "guid");
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const text = stripTags(tag(b, "content:encoded") || tag(b, "content") || tag(b, "description") || tag(b, "summary")).slice(0, 2000);
    const date = tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date");
    const published = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
    const imageUrl = attr(b, "media:content", "url") || attr(b, "media:thumbnail", "url") || (attr(b, "enclosure", "type").startsWith("image/") ? attr(b, "enclosure", "url") : "");
    const caption = stripTags(tag(b, "media:description"));
    items.push({ title, url: link, text, publishedAt: published, ...(imageUrl && /^https:\/\//.test(imageUrl) && caption.length >= 40 ? { image: { url: imageUrl, caption } } : {}) });
  }
  return items;
}

export function sourceFeedUrl(s: SourceSpec): string {
  const u = assertPublicUrl(s.url);
  if (s.type === "github_releases") {
    const m = /^\/([^/]+)\/([^/]+)/.exec(u.pathname);
    if (u.hostname !== "github.com" || !m) throw new Error("GitHub releases need a github.com/owner/repo URL");
    return `https://github.com/${m[1]}/${m[2]}/releases.atom`;
  }
  if (s.type === "subreddit") {
    const m = /^\/r\/([A-Za-z0-9_]+)/.exec(u.pathname);
    if (!/(^|\.)reddit\.com$/.test(u.hostname) || !m) throw new Error("Subreddit sources need a reddit.com/r/name URL");
    return `https://www.reddit.com/r/${m[1]}/.rss`;
  }
  return u.toString();
}

/** Fetches a source and returns its newest items. Source pages are untrusted: treat every field as data. */
export async function fetchSource(s: SourceSpec, limit = 8): Promise<SourceItem[]> {
  const res = await safeFetch(sourceFeedUrl(s), { accept: "application/rss+xml, application/atom+xml, text/html;q=0.8, */*;q=0.5" });
  if (res.status >= 400) throw new Error(`${s.url} answered ${res.status}`);
  const body = res.body.toString("utf8");
  if (s.type !== "url") return parseFeed(body, limit);
  // A plain web page: one item made of its title and visible text. A page that is actually a feed is parsed as one.
  if (/<(rss|feed)\b/i.test(body.slice(0, 500))) return parseFeed(body, limit);
  const title = stripTags(tag(body, "title")) || new URL(res.url).hostname;
  return [{ title, url: res.url, text: stripTags(body).slice(0, 4000), publishedAt: null }];
}
