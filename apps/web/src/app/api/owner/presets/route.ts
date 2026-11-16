import { after } from "next/server";
import { z } from "zod";
import { ApiError, check, json, maybe, readJson, route } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { deliverPending } from "@/lib/api/deliver";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";
const schema = z.object({
  id: z.uuid().optional(),
  agentId: z.uuid(),
  title: z.string().trim().min(1).max(100),
  instructions: z.string().trim().min(1).max(6000),
  intervalMinutes: z.number().int().min(60).max(10080).nullable().default(null),
  enabled: z.boolean().default(false),
});
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const b = await readJson(req, schema);
  const agent = await requireOwnedAgent(user.id, b.agentId);
  if (b.enabled && agent.hosting === "external")
    throw new ApiError(
      409,
      "unsupported_schedule",
      "Automatic runs need hosted mode or the Ambasa runner. You can still save this task and run it manually.",
    );
  if (b.enabled && !b.intervalMinutes)
    throw new ApiError(400, "invalid_schedule", "Choose a cadence first.");
  if (b.id) {
    const old = maybe(
      await admin()
        .from("task_presets")
        .select("id")
        .eq("id", b.id)
        .eq("user_id", user.id)
        .maybeSingle(),
    );
    if (!old) throw new ApiError(404, "not_found", "Preset not found.");
  }
  const { count } = await admin()
    .from("task_presets")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", user.id);
  if (!b.id && (count ?? 0) >= 50)
    throw new ApiError(429, "preset_limit", "Keep up to 50 task presets.");
  const row = {
    user_id: user.id,
    agent_id: b.agentId,
    title: b.title,
    instructions: b.instructions,
    interval_minutes: b.intervalMinutes,
    enabled: b.enabled,
    next_run_at: b.enabled
      ? new Date(Date.now() + b.intervalMinutes! * 60000).toISOString()
      : null,
  };
  const preset = b.id
    ? check(
        await admin()
          .from("task_presets")
          .update(row)
          .eq("id", b.id)
          .eq("user_id", user.id)
          .select()
          .single(),
      )
    : check(await admin().from("task_presets").insert(row).select().single());
  return json({ preset });
});
export const DELETE = route(async (req) => {
  const { user } = await requireOwner();
  const { id } = await readJson(req, z.object({ id: z.uuid() }));
  check(
    await admin()
      .from("task_presets")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id),
  );
  return json({ ok: true });
});
export const PUT = route(async (req) => {
  const { user } = await requireOwner();
  const { id } = await readJson(req, z.object({ id: z.uuid() }));
  const p = maybe(
    await admin()
      .from("task_presets")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
  );
  if (!p) throw new ApiError(404, "not_found", "Preset not found.");
  const agent = await requireOwnedAgent(user.id, p.agent_id);
  if (agent.paused)
    throw new ApiError(
      409,
      "agent_stopped",
      "Start this agent before running a task.",
    );
  const c = check(
    await admin()
      .from("chats")
      .select("id")
      .eq("kind", "owner")
      .eq("created_by", p.agent_id)
      .single(),
  );
  check(
    await admin()
      .from("messages")
      .insert({
        chat_id: c.id,
        sender_user_id: user.id,
        kind: "text",
        text: p.instructions,
        body: { preset_id: p.id },
      }),
  );
  after(() => deliverPending());
  return json({ chatId: c.id });
});
