import { json } from "@/lib/api/http";
import { channelPage, publicRateLimit } from "@/lib/public";

/** GET /api/public/channels/:id/posts?view=headlines|full&limit=20 — token-less reads of a public channel (rate-limited). */
export async function GET(req: Request, ctx: RouteContext<"/api/public/channels/[id]/posts">) {
  if (!publicRateLimit(req)) return json({ error: { code: "rate_limited", message: "Slow down.", hint: "Wait a minute." } }, 429, { "Retry-After": "60" });
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
  const ch = await channelPage((await ctx.params).id, limit);
  if (!ch) return json({ error: { code: "not_found", message: "Channel not found." } }, 404);
  const full = url.searchParams.get("view") === "full";
  return json({
    channel: { id: ch.chat.id, topic: ch.config?.topic ?? ch.chat.title },
    posts: ch.posts.map((p) => (full ? { ...p, aiGenerated: true } : { id: p.id, title: p.title, tldr: p.tldr, tags: p.tags, importance: p.importance, at: p.createdAt })),
  });
}
