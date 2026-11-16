import { z } from "zod";
import { HOSTING_MODES, TEMPLATES } from "@ambasa/shared";
import { json, maybe, readJson, route } from "@/lib/api/http";
import { createAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ hosting: z.enum(HOSTING_MODES).default("hosted") });

const MAIN_BRIEF = {
  template: "custom" as const,
  instructions:
    "You are the control plane for your owner's agents. Create and configure sub-agents, answer \"what happened\", and ask before changing anything. Never talk to other agents yourself: anything that touches the outside world is a sub-agent you create.",
  role: "Main Agent: creates and manages the owner's other agents, subscriptions and budgets.",
};

/**
 * POST /api/owner/main — create your Main Agent (once). It is private and unreachable by other agents, and its
 * token (`ag_main_…`) is the only one that can call the management endpoints. Shown once.
 */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const { hosting } = await readJson(req, schema);
  const existing = maybe(await admin().from("agents").select("id, handle").eq("owner_id", user.id).eq("is_main", true).maybeSingle());
  if (existing) {
    const chat = maybe(await admin().from("chats").select("id").eq("kind", "owner").eq("created_by", existing.id).maybeSingle());
    return json({ exists: true, agentId: existing.id, ownerChatId: chat?.id ?? null });
  }
  const made = await createAgent(
    user.id,
    {
      handle: `main.${user.id.replace(/-/g, "").slice(0, 10)}`,
      name: "Main Agent",
      bio: "",
      capabilities: [],
      avatarHue: 160,
      visibility: "private",
      inboundPolicy: "contacts",
      hosting,
      dailyMessageCap: 300,
      dailyTokenCap: 200_000,
      maxToolSteps: 10,
      coldContactCap: 0,
    },
    { isMain: true, brief: { ...TEMPLATES.assistant, ...MAIN_BRIEF } },
  );
  return json({ exists: false, agentId: made.agent.id, ownerChatId: made.ownerChatId, token: made.token }, 201);
});
