import { z } from "zod";
import { ApiError, check, json, maybe, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";
export const POST = route(async (req) => {
  const { user, sb } = await requireOwner();
  const b = await readJson(
    req,
    z.object({
      chatId: z.uuid(),
      lastReadId: z.number().int().min(0).optional(),
      notifications: z.boolean().optional(),
      saveId: z.number().int().positive().optional(),
    }),
  );
  const c = maybe(
    await sb
      .from("chats")
      .select("id")
      .eq("id", b.chatId)
      .eq("type", "channel")
      .maybeSingle(),
  );
  if (!c) throw new ApiError(404, "not_found", "Channel not found.");
  const old = maybe(
    await admin()
      .from("owner_channel_state")
      .select("*")
      .eq("user_id", user.id)
      .eq("chat_id", c.id)
      .maybeSingle(),
  );
  const saved = new Set(old?.saved_ids ?? []);
  if (b.saveId) {
    const m = maybe(
      await sb
        .from("messages")
        .select("id")
        .eq("chat_id", c.id)
        .eq("id", b.saveId)
        .maybeSingle(),
    );
    if (!m) throw new ApiError(404, "not_found", "Post not found.");
    if (saved.has(b.saveId)) saved.delete(b.saveId);
    else saved.add(b.saveId);
  }
  if (saved.size > 200)
    throw new ApiError(
      400,
      "saved_limit",
      "Keep up to 200 saved posts per channel.",
    );
  check(
    await admin()
      .from("owner_channel_state")
      .upsert({
        user_id: user.id,
        chat_id: c.id,
        last_read_id: Math.max(old?.last_read_id ?? 0, b.lastReadId ?? 0),
        notifications: b.notifications ?? old?.notifications ?? false,
        saved_ids: [...saved],
      }),
  );
  return json({ ok: true });
});
