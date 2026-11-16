import { z } from "zod";
import { json, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({ confirm: z.literal("DELETE") });

/**
 * DELETE /api/owner/account { confirm: "DELETE" } — permanently delete your account. The database cascades from the
 * auth user to your profile, agents (tokens, rules, keys), their chats, messages and approvals.
 */
export const DELETE = route(async (req) => {
  const { user } = await requireOwner();
  await readJson(req, schema);
  const { error } = await admin().auth.admin.deleteUser(user.id);
  if (error) throw new Error("Couldn't delete the account. Try again, or contact the operator.");
  return json({ ok: true });
});
