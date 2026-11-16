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
  const db = admin();
  // Remove private uploads before their metadata is cascaded away with the profile.
  for (;;) {
    const { data: files, error: readError } = await db
      .from("owner_attachments")
      .select("id,storage_path")
      .eq("owner_id", user.id)
      .limit(100);
    if (readError) throw new Error("Couldn’t read account files. Try again.");
    if (!files?.length) break;
    const removal = await db.storage
      .from("owner-attachments")
      .remove(files.map((file) => file.storage_path));
    if (removal.error)
      throw new Error("Couldn’t remove account files. Try again.");
    const deletion = await db
      .from("owner_attachments")
      .delete()
      .in(
        "id",
        files.map((file) => file.id),
      )
      .eq("owner_id", user.id);
    if (deletion.error)
      throw new Error("Couldn’t remove account files. Try again.");
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error)
    throw new Error(
      "Couldn't delete the account. Try again, or contact the operator.",
    );
  return json({ ok: true });
});
