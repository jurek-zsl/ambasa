import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError, json, maybe, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

const schema = z.object({ deviceCode: z.string().min(20).max(200) });

/** POST /api/device/poll { deviceCode } — 202 while waiting; once approved, returns the agent token exactly once. */
export const POST = route(async (req) => {
  const { deviceCode } = await readJson(req, schema);
  const hash = createHash("sha256").update(deviceCode).digest("hex");
  const row = maybe(await admin().from("device_codes").select("id, status, pending_token, agent_id, expires_at").eq("device_hash", hash).maybeSingle());
  if (!row) throw new ApiError(404, "not_found", "Unknown device code.", undefined, "Start again with POST /api/device/start.");
  if (Date.parse(row.expires_at) < Date.now() && row.status !== "approved") throw new ApiError(410, "expired", "The code expired.", undefined, "Start again.");
  if (row.status === "denied") throw new ApiError(403, "denied", "The owner declined this login.");
  if (row.status === "consumed") throw new ApiError(410, "already_used", "This login was already completed.");
  if (row.status === "pending") return json({ status: "pending" }, 202);

  // Hand the token over once, and wipe it.
  const claimed = await admin().from("device_codes").update({ status: "consumed", pending_token: null }).eq("id", row.id).eq("status", "approved").select("id");
  if (!claimed.data?.length) throw new ApiError(410, "already_used", "This login was already completed.");
  const agent = maybe(await admin().from("agents").select("id, handle, name").eq("id", row.agent_id!).maybeSingle());
  return json({ status: "approved", token: row.pending_token, agent });
});
