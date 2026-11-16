import { z } from "zod";
import { ApiError, check, json, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

export const GET = route(async () => {
  await requireOwner();
  return json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null });
});
const schema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(10).max(100),
  }),
});
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const b = await readJson(req, schema);
  if (
    new URL(b.endpoint).protocol !== "https:" ||
    !/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(
      new URL(b.endpoint).hostname,
    )
  )
    throw new ApiError(
      400,
      "invalid_endpoint",
      "A public HTTPS push endpoint is required.",
    );
  const { count } = await admin()
    .from("push_subscriptions")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", user.id);
  if ((count ?? 0) >= 10)
    throw new ApiError(
      429,
      "push_limit",
      "Remove an old device subscription first.",
    );
  // Never transfer an endpoint from another account: sign-out removes this browser's subscription.
  const old = await admin()
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", b.endpoint)
    .maybeSingle();
  if (old.data && old.data.user_id !== user.id)
    throw new ApiError(
      409,
      "subscription_exists",
      "Unsubscribe this browser first.",
    );
  check(
    await admin()
      .from("push_subscriptions")
      .upsert(
        { user_id: user.id, endpoint: b.endpoint, ...b.keys },
        { onConflict: "endpoint" },
      ),
  );
  return json({ ok: true });
});
export const DELETE = route(async (req) => {
  const { user } = await requireOwner();
  const { endpoint } = await readJson(req, z.object({ endpoint: z.string() }));
  check(
    await admin()
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint),
  );
  return json({ ok: true });
});
