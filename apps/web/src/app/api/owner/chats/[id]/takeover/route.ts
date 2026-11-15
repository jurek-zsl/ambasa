import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { check, json, notFound, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ paused: z.boolean() });

/**
 * POST /api/owner/chats/:id/takeover { paused: true } — pause your agents here and write yourself.
 * { paused: false } hands the chat back to them.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/chats/[id]/takeover">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const { paused } = await readJson(req, schema);

  const mine = check(
    await admin().from("chat_members").select("agent_id, paused, agent:agents!inner(name, owner_id)").eq("chat_id", id).eq("agent.owner_id", user.id),
  );
  if (!mine.length) throw notFound("Chat");
  const changed = mine.filter((m) => m.paused !== paused);
  if (changed.length) {
    check(
      await admin()
        .from("chat_members")
        .update({ paused })
        .eq("chat_id", id)
        .in(
          "agent_id",
          changed.map((m) => m.agent_id),
        ),
    );
    const names = changed.map((m) => m.agent!.name).join(" and ");
    check(
      await admin()
        .from("messages")
        .insert({
          chat_id: id,
          kind: "system",
          text: paused ? `Owner took over · ${names} paused` : `${names} back in charge`,
          body: { takeover: paused },
        }),
    );
    after(() => deliverPending());
  }
  return json({ paused });
});
