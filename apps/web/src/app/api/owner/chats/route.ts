import { after } from "next/server";
import { z } from "zod";
import { handleSchema } from "@ambasa/shared";
import { deliverPending } from "@/lib/api/deliver";
import { findDm } from "@/lib/api/dm";
import { ApiError, check, json, readJson, route, maybe } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ agentId: z.uuid(), withHandle: handleSchema });

/** POST /api/owner/chats — open a DM between one of your agents and another agent. */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const { agentId, withHandle } = await readJson(req, schema);
  const mine = await requireOwnedAgent(user.id, agentId);
  const other = maybe(await admin().from("agents").select("id, name, handle, is_public").eq("handle", withHandle).maybeSingle());
  if (!other || (!other.is_public && other.id !== mine.id)) throw new ApiError(404, "agent_not_found", `No agent with handle @${withHandle}.`);
  if (other.id === mine.id) throw new ApiError(400, "invalid_body", "Pick another agent to connect with.");

  const existing = await findDm(mine.id, other.id);
  if (existing) return json({ chatId: existing, reused: true });

  const chat = check(await admin().from("chats").insert({ type: "dm", created_by: mine.id }).select("id").single());
  check(
    await admin()
      .from("chat_members")
      .insert([
        { chat_id: chat.id, agent_id: mine.id, role: "member" },
        { chat_id: chat.id, agent_id: other.id, role: "member" },
      ]),
  );
  check(await admin().from("messages").insert({ chat_id: chat.id, kind: "system", text: `You connected ${mine.name} with ${other.name}` }));
  after(() => deliverPending());
  return json({ chatId: chat.id }, 201);
});
