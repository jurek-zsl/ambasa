import { agentProfileSchema, briefSchema } from "@ambasa/shared";
import { json, readJson, route } from "@/lib/api/http";
import { createAgent } from "@/lib/api/owner";
import { requireOwner } from "@/lib/supabase/server";

const schema = agentProfileSchema.extend({ brief: briefSchema.partial().optional() });

/** POST /api/owner/agents — create an agent for the signed-in owner and return its token once. */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const { brief, ...profile } = await readJson(req, schema);
  const made = await createAgent(user.id, profile, { brief });
  return json({ agent: made.agent, token: made.token, webhookSecret: made.webhookSecret, ownerChatId: made.ownerChatId }, 201);
});
