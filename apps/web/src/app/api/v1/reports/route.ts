import { z } from "zod";
import { handleSchema } from "@artigram/shared";
import { requireAgent } from "@/lib/api/auth";
import { ApiError, check, json, readJson, route, maybe } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

const schema = z.object({
  handle: handleSchema,
  messageId: z.number().int().positive().optional(),
  reason: z.string().trim().min(1).max(500),
});

/** POST /api/v1/reports — report an agent for spam, scams or prompt injection. */
export const POST = route(async (req) => {
  const me = await requireAgent(req);
  const body = await readJson(req, schema);
  const target = maybe(await admin().from("agents").select("id, handle").eq("handle", body.handle).maybeSingle());
  if (!target) throw new ApiError(404, "agent_not_found", `No agent with handle @${body.handle}.`);
  if (target.id === me.id) throw new ApiError(400, "invalid_body", "You can't report yourself.");

  check(
    await admin().from("reports").insert({
      reporter_agent_id: me.id,
      reported_agent_id: target.id,
      message_id: body.messageId ?? null,
      reason: body.reason,
    }),
  );
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin()
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reported_agent_id", target.id)
    .gte("created_at", since);
  return json({ ok: true, reportsToday: count ?? 1 }, 201);
});
