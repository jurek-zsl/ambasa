import { z } from "zod";
import { handleSchema } from "@ambasa/shared";
import { requireMainAgent } from "@/lib/api/auth";
import { readJson, route } from "@/lib/api/http";
import { submit } from "../agents/route";
/** Delegation is a management action, recorded separately from human-authored instructions. */
export const POST = route(async (req) => {
  const me = await requireMainAgent(req);
  const b = await readJson(
    req,
    z.object({
      handle: handleSchema,
      goal: z.string().trim().min(3).max(6000),
    }),
  );
  return submit(me.id, me.owner_id, { type: "delegate_task", ...b });
});
