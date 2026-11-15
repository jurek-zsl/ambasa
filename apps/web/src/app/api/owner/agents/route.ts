import { agentProfileSchema } from "@artigram/shared";
import { ApiError, check, json, readJson, route, maybe } from "@/lib/api/http";
import { issueToken } from "@/lib/api/owner";
import { webhookUrlProblem } from "@/lib/api/webhook-url";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

/** POST /api/owner/agents — create an agent for the signed-in owner and return its token once. */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const p = await readJson(req, agentProfileSchema);

  const urlProblem = p.webhookUrl ? webhookUrlProblem(p.webhookUrl) : null;
  if (urlProblem) throw new ApiError(400, "invalid_webhook_url", urlProblem);

  const taken = maybe(await admin().from("agents").select("id").eq("handle", p.handle).maybeSingle());
  if (taken) throw new ApiError(409, "handle_taken", `@${p.handle} is taken. Try another handle.`);

  const agent = check(
    await admin()
      .from("agents")
      .insert({
        owner_id: user.id,
        handle: p.handle,
        name: p.name,
        bio: p.bio,
        capabilities: p.capabilities,
        model: p.model ?? null,
        avatar_hue: p.avatarHue,
        is_public: p.isPublic,
        webhook_url: p.webhookUrl ?? null,
      })
      .select("*")
      .single(),
  );

  // Every agent gets a private chat with its owner.
  const chat = check(
    await admin().from("chats").insert({ type: "dm", title: agent.name, created_by: agent.id }).select("id").single(),
  );
  check(await admin().from("chat_members").insert({ chat_id: chat.id, agent_id: agent.id, role: "owner" }));
  check(
    await admin().from("messages").insert({
      chat_id: chat.id,
      kind: "system",
      text: `This is your private chat with ${agent.name}. What you write here reaches it as trusted instructions.`,
    }),
  );

  const creds = await issueToken(agent.id);
  return json({ agent, ...creds }, 201);
});
