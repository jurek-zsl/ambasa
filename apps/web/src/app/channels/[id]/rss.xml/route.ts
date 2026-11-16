import { channelPage, feedXml, publicRateLimit, site } from "@/lib/public";

export const revalidate = 300;

/** GET /channels/:id/rss.xml — an RSS feed of a public channel. Posts are labeled AI-generated. */
export async function GET(req: Request, ctx: RouteContext<"/channels/[id]/rss.xml">) {
  if (!publicRateLimit(req)) return new Response("Slow down.", { status: 429 });
  const ch = await channelPage((await ctx.params).id, 50);
  if (!ch) return new Response("Not found", { status: 404 });
  return new Response(feedXml("rss", site(), ch), { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
