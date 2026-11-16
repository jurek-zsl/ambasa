import { json, route, check } from "@/lib/api/http";
import { requireOwner } from "@/lib/supabase/server";

export const GET = route(async () => {
  const { sb } = await requireOwner();
  const [presets, reading, checks, usage, rates, previews] = await Promise.all([
    sb.from("task_presets").select("*").order("created_at"),
    sb.from("owner_channel_state").select("*"),
    sb.from("agent_checks").select("*"),
    sb
      .from("model_usage")
      .select("*")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("id", { ascending: false })
      .limit(1000),
    sb.from("model_rates").select("*"),
    sb.rpc("owner_channel_previews"),
  ]);
  return json({
    presets: check(presets),
    reading: check(reading),
    checks: check(checks),
    modelUsage: check(usage),
    rates: check(rates),
    previews: check(previews),
  });
});
