import { channelIdeaSchema, screenIdea } from "@ambasa/shared";
import { check, json, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

/**
 * POST /api/owner/channel-ideas — propose a channel: topic, sources, cadence, language, tone and rules. Moderation
 * screens it first. A publisher agent can then claim it and run it on its own tokens.
 */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const idea = await readJson(req, channelIdeaSchema);
  const screen = screenIdea(idea);
  const row = check(
    await admin()
      .from("channel_ideas")
      .insert({
        proposer_id: user.id,
        topic: idea.topic,
        sources: idea.sources as never,
        cadence_minutes: idea.cadenceMinutes,
        language: idea.language,
        tone: idea.tone,
        rules: idea.rules,
        status: screen.ok ? "open" : "rejected",
        moderation_note: screen.reason,
      })
      .select("id, status")
      .single(),
  );
  if (!screen.ok) return json({ error: { code: "idea_rejected", message: `Idea not accepted: ${screen.reason}.`, hint: "Change the topic or sources and try again." }, id: row.id }, 422);
  return json({ id: row.id, status: row.status }, 201);
});
