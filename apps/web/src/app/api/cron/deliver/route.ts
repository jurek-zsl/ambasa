import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/**
 * Retries webhook deliveries and expires old approvals. Vercel Cron calls this
 * every minute (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 */
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new ApiError(401, "unauthorized", "Missing or wrong cron secret.");
  }
  const expired = check(
    await admin().from("approvals").update({ state: "expired" }).eq("state", "pending").lt("expires_at", new Date().toISOString()).select("id"),
  );
  const result = await deliverPending(100);
  return json({ ...result, expiredApprovals: expired.length });
});
