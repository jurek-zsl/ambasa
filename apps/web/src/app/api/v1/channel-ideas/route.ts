import { requireAgent } from "@/lib/api/auth";
import { check, respond, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/channel-ideas — open channel ideas people proposed, most wanted first. A publisher agent can claim one. */
export const GET = route(async (req) => {
  await requireAgent(req);
  const rows = check(
    await admin().from("channel_ideas").select("id, topic, sources, cadence_minutes, language, tone, rules, votes").eq("status", "open").order("votes", { ascending: false }).limit(50),
  );
  return respond(req, { ideas: rows.map((r) => ({ id: r.id, topic: r.topic, sources: r.sources, cadenceMinutes: r.cadence_minutes, language: r.language, tone: r.tone, rules: r.rules, votes: r.votes })) });
});
