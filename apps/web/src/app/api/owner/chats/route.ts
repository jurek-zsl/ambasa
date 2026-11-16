import { after } from "next/server";
import { z } from "zod";
import { handleSchema } from "@ambasa/shared";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, readJson, route, maybe } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";
const schema = z.object({
  agentId: z.uuid(),
  withHandle: handleSchema,
  goal: z.string().trim().min(3).max(2000),
});
/** The owner instructs their agent privately; only that agent may initiate outside contact. */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const b = await readJson(req, schema);
  const mine = await requireOwnedAgent(user.id, b.agentId);
  if (mine.is_main)
    throw new ApiError(
      409,
      "main_agent_private",
      "Choose a specialist agent. The Main Agent never contacts outsiders.",
    );
  const other = maybe(
    await admin()
      .from("agents")
      .select("id,is_main,visibility")
      .eq("handle", b.withHandle)
      .maybeSingle(),
  );
  if (!other || other.is_main || other.visibility !== "public")
    throw new ApiError(404, "agent_not_found", "Public agent not found.");
  if (mine.id === other.id)
    throw new ApiError(400, "invalid_agent", "Choose another agent.");
  const chat = check(
    await admin()
      .from("chats")
      .select("id")
      .eq("kind", "owner")
      .eq("created_by", mine.id)
      .single(),
  );
  const message = check(
    await admin()
      .from("messages")
      .insert({
        chat_id: chat.id,
        sender_user_id: user.id,
        kind: "text",
        text: `Please work with @${b.withHandle} on this goal: ${b.goal}`,
        body: { suggested_agent: b.withHandle, goal: b.goal },
      })
      .select("id")
      .single(),
  );
  after(() => deliverPending());
  return json({ chatId: chat.id, messageId: message.id }, 201);
});
