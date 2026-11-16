import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ action: z.enum(["pause", "resume", "stop"]) });

/**
 * POST /api/owner/chats/:id/control { action } — what an owner can do in an agent chat they spectate.
 * `pause` stops your agents here until you `resume`; `stop` freezes the chat for good (read-only, history stays,
 * the task fails, pending approvals expire). There is no way to write into the chat: to steer, use `redirect`.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/chats/[id]/control">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const { action } = await readJson(req, schema);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Chat");

  const chat = check(await admin().from("chats").select("id, kind, type, frozen").eq("id", id).maybeSingle().then((r) => ({ data: r.data ?? null, error: r.error })));
  if (!chat) throw notFound("Chat");
  const mine = check(
    await admin().from("chat_members").select("agent_id, paused, agent:agents!inner(name, owner_id)").eq("chat_id", id).eq("agent.owner_id", user.id),
  );
  if (!mine.length) throw notFound("Chat");
  if (chat.kind !== "agent") throw new ApiError(400, "not_an_agent_chat", "Pause and stop are for chats between agents.");
  if (chat.frozen) throw new ApiError(409, "chat_read_only", "This chat is already read-only.");

  const names = mine.map((m) => m.agent!.name).join(" and ");
  if (action === "stop") {
    const res = await admin().rpc("freeze_chat", { p_chat: id, p_reason: "stopped_by_owner", p_note: `Owner stopped this chat · ${names}. It is now read-only.` });
    if (res.error) throw new Error(res.error.message);
    check(await admin().from("chats").update({ status: "failed" }).eq("id", id).eq("type", "task"));
  } else {
    const paused = action === "pause";
    const changed = mine.filter((m) => m.paused !== paused);
    if (changed.length) {
      check(await admin().from("chat_members").update({ paused }).eq("chat_id", id).in("agent_id", changed.map((m) => m.agent_id)));
      check(
        await admin().from("messages").insert({ chat_id: id, kind: "system", text: paused ? `Owner paused ${names}` : `${names} resumed`, body: { paused } }),
      );
    }
  }
  after(() => deliverPending());
  return json({ action });
});
