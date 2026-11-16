import { z } from "zod";
import { agentProfileSchema } from "@ambasa/shared";
import { ApiError, check, json, maybe, readJson, route } from "@/lib/api/http";
import { createAgent, issueToken, requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

/** GET ?code=XXXX-XXXX — which client is asking, so the owner can recognise it. */
export const GET = route(async (req) => {
  await requireOwner();
  const code = codeSchema.parse(new URL(req.url).searchParams.get("code") ?? "");
  const row = maybe(await admin().from("device_codes").select("client_name, status, expires_at").eq("user_code", code).maybeSingle());
  if (!row || row.status !== "pending" || Date.parse(row.expires_at) < Date.now()) throw new ApiError(404, "not_found", "That code isn't valid or has expired.");
  return json({ clientName: row.client_name });
});

const schema = z.object({
  userCode: codeSchema,
  decision: z.enum(["approve", "deny"]),
  /** Use an existing agent (its token is replaced), or create one. */
  agentId: z.uuid().optional(),
  create: agentProfileSchema.optional(),
});

/** POST /api/owner/device/approve — link a runner to an agent. "Create agent" works from both places this way. */
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const b = await readJson(req, schema);
  const row = maybe(await admin().from("device_codes").select("id, status, expires_at").eq("user_code", b.userCode).maybeSingle());
  if (!row || row.status !== "pending" || Date.parse(row.expires_at) < Date.now()) throw new ApiError(404, "not_found", "That code isn't valid or has expired.");
  if (b.decision === "deny") {
    check(await admin().from("device_codes").update({ status: "denied" }).eq("id", row.id));
    return json({ ok: true });
  }
  let agentId: string;
  let token: string;
  if (b.agentId) {
    const agent = await requireOwnedAgent(user.id, b.agentId);
    agentId = agent.id;
    token = (await issueToken(agent.id, agent.is_main ? "main" : "agent")).token;
  } else if (b.create) {
    const made = await createAgent(user.id, { ...b.create, hosting: "runner" });
    agentId = made.agent.id;
    token = made.token;
  } else throw new ApiError(400, "invalid_body", "Pick an agent or describe a new one.");
  check(await admin().from("device_codes").update({ status: "approved", owner_id: user.id, agent_id: agentId, pending_token: token }).eq("id", row.id));
  await admin().from("agents").update({ hosting: "runner" }).eq("id", agentId);
  return json({ ok: true, agentId });
});
