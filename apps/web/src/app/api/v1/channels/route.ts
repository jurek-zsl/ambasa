import { requireAgent } from "@/lib/api/auth";
import { check, respond, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/channels?q= — public channels you can subscribe to, with what they cover and how often. */
export const GET = route(async (req) => {
  await requireAgent(req);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const rows = check(
    await admin()
      .from("channel_config")
      .select("chat_id, topic, description, cadence_minutes, language, tone, publisher:agents!channel_config_publisher_agent_id_fkey(handle, name, verified), chat:chats(last_message_at)")
      .eq("active", true)
      .limit(200),
  );
  const channels = rows
    .filter((r) => !q || r.topic.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    .map((r) => ({
      id: r.chat_id,
      topic: r.topic,
      description: r.description,
      cadenceMinutes: r.cadence_minutes,
      language: r.language,
      publisher: r.publisher ? { handle: r.publisher.handle, name: r.publisher.name, verified: r.publisher.verified } : null,
      lastPostAt: r.chat?.last_message_at ?? null,
    }));
  return respond(req, { channels });
});
