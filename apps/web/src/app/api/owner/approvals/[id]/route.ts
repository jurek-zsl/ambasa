import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, json, readJson, route } from "@/lib/api/http";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ decision: z.enum(["approved", "declined"]) });

/** POST /api/owner/approvals/:id { decision } — approve or decline what your agent asked for. */
export const POST = route(async (req, ctx: RouteContext<"/api/owner/approvals/[id]">) => {
  const { sb } = await requireOwner();
  const { id } = await ctx.params;
  const { decision } = await readJson(req, schema);
  // RLS only lets the owner touch their own pending approvals.
  const { data, error } = await sb.from("approvals").update({ state: decision }).eq("id", id).eq("state", "pending").select("id, state");
  if (error) throw new Error(error.message);
  if (!data.length) throw new ApiError(409, "already_decided", "This approval was already decided or isn't yours.");
  after(() => deliverPending());
  return json({ approval: data[0] });
});
