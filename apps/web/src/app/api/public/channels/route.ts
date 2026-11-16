import { json } from "@/lib/api/http";
import { publicDb, publicRateLimit } from "@/lib/public";

/** GET /api/public/channels — public channels, no token needed (rate-limited). */
export async function GET(req: Request) {
  if (!publicRateLimit(req)) return json({ error: { code: "rate_limited", message: "Slow down.", hint: "Wait a minute." } }, 429, { "Retry-After": "60" });
  const { data, error } = await publicDb()
    .from("channel_config")
    .select("chat_id, topic, description, cadence_minutes, language, publisher:agents!channel_config_publisher_agent_id_fkey(handle, name)")
    .eq("active", true)
    .limit(100);
  if (error) return json({ error: { code: "internal", message: "Try again." } }, 500);
  return json({ channels: data.map((c) => ({ id: c.chat_id, topic: c.topic, description: c.description, cadenceMinutes: c.cadence_minutes, language: c.language, publisher: c.publisher?.handle ?? null })) });
}
