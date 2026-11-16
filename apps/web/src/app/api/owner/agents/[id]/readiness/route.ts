import { ApiError, check, json, maybe, route } from "@/lib/api/http";
import { enforceBudget } from "@/lib/api/usage";
import { requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";
async function context(ctx: RouteContext<"/api/owner/agents/[id]/readiness">) {
  const { user } = await requireOwner();
  return requireOwnedAgent(user.id, (await ctx.params).id);
}
export const GET = route(
  async (_req, ctx: RouteContext<"/api/owner/agents/[id]/readiness">) => {
    const a = await context(ctx);
    const [key, probe, jobs, usage] = await Promise.all([
      admin()
        .from("agent_secrets")
        .select("provider,model,hint")
        .eq("agent_id", a.id)
        .maybeSingle(),
      admin()
        .from("agent_checks")
        .select("*")
        .eq("agent_id", a.id)
        .maybeSingle(),
      admin()
        .from("jobs")
        .select("id,status,last_error,kind,created_at")
        .eq("agent_id", a.id)
        .order("id", { ascending: false })
        .limit(5),
      admin()
        .from("agent_usage")
        .select("tokens,messages")
        .eq("agent_id", a.id)
        .eq("day", new Date().toISOString().slice(0, 10))
        .maybeSingle(),
    ]);
    const failed = (jobs.data ?? []).find((j) => j.status === "failed");
    return json({
      key: maybe(key),
      check: maybe(probe),
      online:
        !!a.runner_seen_at &&
        Date.now() - Date.parse(a.runner_seen_at) < 120000,
      stopped: a.paused,
      budgetExhausted:
        Number(usage.data?.tokens ?? 0) >= a.daily_token_cap ||
        Number(usage.data?.messages ?? 0) >= a.daily_message_cap,
      failed: failed
        ? {
            id: failed.id,
            at: failed.created_at,
            detail:
              "The last run failed. Check the connection, then ask your agent to review unfinished work.",
          }
        : null,
    });
  },
);
export const POST = route(
  async (_req, ctx: RouteContext<"/api/owner/agents/[id]/readiness">) => {
    const a = await context(ctx);
    if (a.hosting !== "hosted")
      throw new ApiError(
        409,
        "external_test",
        "Reconnect your runner or send a private test message to your agent.",
      );
    if (a.paused)
      throw new ApiError(409, "agent_stopped", "Start the agent first.");
    await enforceBudget(a);
    const key = maybe(
      await admin()
        .from("agent_secrets")
        .select("agent_id")
        .eq("agent_id", a.id)
        .maybeSingle(),
    );
    if (!key)
      throw new ApiError(409, "missing_key", "Add a model key before testing.");
    const previous = maybe(
      await admin()
        .from("agent_checks")
        .select("checked_at")
        .eq("agent_id", a.id)
        .maybeSingle(),
    );
    if (previous && Date.now() - Date.parse(previous.checked_at) < 30000)
      throw new ApiError(
        429,
        "test_cooldown",
        "Wait 30 seconds before another test.",
      );
    check(
      await admin()
        .from("agent_checks")
        .upsert({
          agent_id: a.id,
          status: "pending",
          checked_at: new Date().toISOString(),
          detail:
            "Waiting for the hosted worker. This test uses a small number of tokens.",
        }),
    );
    const job = await admin()
      .from("jobs")
      .insert({ agent_id: a.id, kind: "probe" });
    if (job.error && job.error.code !== "23505")
      throw new Error(job.error.message);
    return json({ ok: true });
  },
);
