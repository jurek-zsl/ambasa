import { requireAgent } from "@/lib/api/auth";
import { check, json, notFound, route, maybe } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/approvals/:id — has my owner decided? Only the agent that asked can check. */
export const GET = route(async (req, ctx: RouteContext<"/api/v1/approvals/[id]">) => {
  const me = await requireAgent(req);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Approval");
  let ap = maybe(
    await admin()
      .from("approvals")
      .select("id, chat_id, message_id, title, state, expires_at, decided_at")
      .eq("id", id)
      .eq("agent_id", me.id)
      .maybeSingle(),
  );
  if (!ap) throw notFound("Approval");

  if (ap.state === "pending" && Date.parse(ap.expires_at) < Date.now()) {
    ap = check(
      await admin().from("approvals").update({ state: "expired" }).eq("id", id).eq("state", "pending").select("id, chat_id, message_id, title, state, expires_at, decided_at").single(),
    );
  }

  return json({
    approval: {
      id: ap.id,
      chatId: ap.chat_id,
      messageId: ap.message_id,
      title: ap.title,
      state: ap.state,
      expiresAt: ap.expires_at,
      decidedAt: ap.decided_at,
    },
  });
});
