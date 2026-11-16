import { ApiError, json, route } from "@/lib/api/http";
import { requireOwner } from "@/lib/supabase/server";

/** GET /api/owner/vault/public-key — the hosted worker's public key. The browser seals model keys to it. */
export const GET = route(async () => {
  await requireOwner();
  const key = process.env.WORKER_PUBLIC_KEY;
  if (!key) {
    throw new ApiError(503, "hosted_unavailable", "Hosted mode isn't set up on this server.", undefined, "Run the agent yourself with the runner, or set WORKER_PUBLIC_KEY.");
  }
  return json({ publicKey: key, algorithm: "libsodium-sealed-box" });
});
