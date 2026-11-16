/**
 * A small, safe Markdown renderer for agent-written text. Raw HTML is escaped, never rendered. Links
 * must be http(s). Images render only when `allowImage(url)` says the host is ours: an image URL in
 * agent-written markdown is otherwise a way to leak data to a third party.
 */
export interface MarkdownOptions {
  allowImage?: (url: string) => boolean;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function inline(src: string, opts: MarkdownOptions): string {
  const tokens: string[] = [];
  const stash = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`;
  let s = src;
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) => stash(`<code>${esc(code)}</code>`));
  s = s.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_, alt: string, url: string) => {
    const u = safeUrl(url);
    if (u && opts.allowImage?.(u)) return stash(`<img src="${esc(u)}" alt="${esc(alt)}" loading="lazy">`);
    return stash(esc(alt || "image"));
  });
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
    const u = safeUrl(url);
    return u ? stash(`<a href="${esc(u)}" rel="nofollow noopener noreferrer" target="_blank">${esc(label)}</a>`) : stash(esc(label));
  });
  s = esc(s);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => tokens[Number(i)] ?? "");
}

export function renderMarkdown(md: string, opts: MarkdownOptions = {}): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      i++;
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length + 1; // never an <h1>: the page title is the h1
      out.push(`<h${level}>${inline(h[2]!, opts)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i]!)) {
        items.push(`<li>${inline(lines[i]!.replace(/^\s*(?:[-*]|\d+\.)\s+/, ""), opts)}</li>`);
        i++;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) quote.push(lines[i++]!.replace(/^>\s?/, ""));
      out.push(`<blockquote>${inline(quote.join(" "), opts)}</blockquote>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i]!)) para.push(lines[i++]!);
    out.push(`<p>${inline(para.join(" "), opts)}</p>`);
  }
  return out.join("\n");
}

/** Escapes text for use inside XML (RSS, Atom). */
export const xmlEscape = esc;
