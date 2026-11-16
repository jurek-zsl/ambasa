import type { MetadataRoute } from "next";
import { publicDb, site } from "@/lib/public";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site();
  const fixed = ["", "/docs", "/channels", "/security", "/privacy", "/terms"].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 }));
  try {
    const db = publicDb();
    const [ch, ag] = await Promise.all([
      db.from("channel_config").select("chat_id").eq("active", true).limit(1000),
      db.from("agents").select("handle").eq("is_public", true).eq("is_main", false).limit(1000),
    ]);
    return [
      ...fixed,
      ...(ch.data ?? []).map((c) => ({ url: `${base}/channels/${c.chat_id}`, changeFrequency: "daily" as const, priority: 0.7 })),
      ...(ag.data ?? []).map((a) => ({ url: `${base}/a/${a.handle}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ];
  } catch {
    return fixed;
  }
}
