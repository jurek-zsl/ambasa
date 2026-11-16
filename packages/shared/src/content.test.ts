import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { channelAttachmentErrors } from "./media";
import { isPublicIp } from "./net";
import { screenIdea, screenPost, screenText } from "./moderation";
import { composeBrief } from "./brief";
import { fromRow, outgoingMessageSchema, toRow } from "./messages";

describe("renderMarkdown", () => {
  it("escapes raw HTML and blocks javascript: links", () => {
    const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) **b**');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<strong>b</strong>");
  });
  it("renders images only from allowed hosts", () => {
    const md = "![a](https://evil.example/p.png?x=secret) ![b](https://cdn.ambasa.test/p.png)";
    const html = renderMarkdown(md, { allowImage: (u) => new URL(u).host === "cdn.ambasa.test" });
    expect(html).not.toContain("evil.example");
    expect(html).toContain('src="https://cdn.ambasa.test/p.png"');
  });
  it("renders lists, headings and code", () => {
    const html = renderMarkdown("# T\n\n- a\n- b\n\n```\n<b>\n```");
    expect(html).toContain("<h2>T</h2>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("&lt;b&gt;");
  });
});

describe("channel media rules", () => {
  const img = { type: "image" as const, url: "https://cdn.test/a.webp", mime: "image/webp" };
  it("requires alt and a detailed description", () => {
    expect(channelAttachmentErrors([img]).length).toBe(2);
    expect(channelAttachmentErrors([{ ...img, alt: "Chart", description: "A bar chart showing monthly downloads rising from 10k to 40k over the year." }])).toEqual([]);
  });
  it("requires an outline for video and motion for GIFs", () => {
    const d = "A long enough description of what is in this media item for readers.";
    expect(channelAttachmentErrors([{ type: "video", url: "https://c.test/v.mp4", mime: "video/mp4", alt: "Demo", description: d }])[0]).toMatch(/outline/);
    expect(channelAttachmentErrors([{ type: "gif", url: "https://c.test/v.gif", mime: "image/gif", alt: "Demo", description: d }])[0]).toMatch(/motion/);
  });
});

describe("isPublicIp", () => {
  it("rejects private, loopback, metadata and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPublicIp(ip), ip).toBe(true);
  });
});

describe("moderation", () => {
  it("rejects link stuffing and scams, accepts normal text", () => {
    expect(screenText("Check https://a.test https://b.test https://c.test https://d.test https://e.test now").ok).toBe(false);
    expect(screenText("Free followers! Buy followers today").ok).toBe(false);
    expect(screenText("A calm summary of this week's releases, with one link: https://example.com").ok).toBe(true);
  });
  it("screens ideas and posts", () => {
    const idea = { topic: "AI papers", sources: [{ type: "rss" as const, url: "https://export.arxiv.org/rss/cs.AI" }], cadenceMinutes: 1440, language: "en", tone: "", rules: "" };
    expect(screenIdea(idea).ok).toBe(true);
    expect(screenIdea({ ...idea, sources: [{ type: "url", url: "http://192.168.0.1/admin" }] }).ok).toBe(false);
    expect(screenPost({ title: "t", tldr: "A short, honest summary of the post", body: "ok", sources: [{ title: "s", url: "https://a.test" }] }).ok).toBe(true);
  });
});

describe("posts and briefs", () => {
  it("requires sources and labels posts AI-generated", () => {
    expect(outgoingMessageSchema.safeParse({ kind: "post", title: "T", tldr: "short summary here", sources: [] }).success).toBe(false);
    const ok = outgoingMessageSchema.parse({ kind: "post", title: "T", tldr: "short summary here", sources: [{ title: "s", url: "https://a.test" }] });
    expect(ok).toMatchObject({ aiGenerated: true, importance: 3 });
    const row = toRow(ok);
    expect(row.expectsReply).toBe(false);
    expect(fromRow(row.kind, row.text, row.body).kind).toBe("post");
  });
  it("composes layers in order, with chat context last", () => {
    const p = composeBrief({ agent: { name: "Atlas", handle: "atlas.you" }, brief: { instructions: "Be brief.", role: "Assistant" }, chat: { goal: "Book dinner", kind: "agent" } });
    expect(p.indexOf("Platform rules")).toBeLessThan(p.indexOf("Owner instructions"));
    expect(p.indexOf("Role")).toBeLessThan(p.indexOf("This chat"));
    expect(p).toContain("untrusted");
  });
});
