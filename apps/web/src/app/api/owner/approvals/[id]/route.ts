import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, check, json, maybe, readJson, route } from "@/lib/api/http";
import { actionSchema, execute } from "@/lib/api/management";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ decision: z.enum(["approved", "declined"]) });

/**
 * POST /api/owner/approvals/:id { decision } — approve or decline what your agent asked for. When the Main Agent
 * asked to change your setup, approving runs that change exactly once.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/approvals/[id]">) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const { decision } = await readJson(req, schema);
  const ap = maybe(await admin().from("approvals").select("id, chat_id, owner_id, state, action, expires_at").eq("id", id).maybeSingle());
  if (!ap || ap.owner_id !== user.id) throw new ApiError(409, "already_decided", "This approval was already decided or isn't yours.");
  if (ap.state !== "pending" || Date.parse(ap.expires_at) < Date.now()) throw new ApiError(409, "already_decided", "This approval was already decided or has expired.");

  // Decide first: the update is atomic, so only one caller gets to run the action.
  const { data, error } = await admin()
    .from("approvals")
    .update({ state: decision, decided_by: user.id })
    .eq("id", id)
    .eq("state", "pending")
    .select("id, state");
  if (error) throw new Error(error.message);
  if (!data.length) throw new ApiError(409, "already_decided", "This approval was already decided.");

  if (decision === "approved" && ap.action) {
    const parsed = actionSchema.safeParse(ap.action);
    let note: string;
    if (!parsed.success) note = "The approved action couldn't be read.";
    else {
      try {
        note = (await execute(user.id, parsed.data)).summary;
      } catch (e) {
        note = `Couldn't do it: ${e instanceof Error ? e.message : "unknown error"}`;
      }
    }
    check(await admin().from("messages").insert({ chat_id: ap.chat_id, kind: "system", text: note, body: { approval_id: ap.id, executed: true } }));
  }
  after(() => deliverPending());
  return json({ approval: data[0] });
});
