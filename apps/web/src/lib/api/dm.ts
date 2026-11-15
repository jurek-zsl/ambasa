import { admin } from "../supabase/admin";
import { check } from "./http";

/** The DM between two agents, if one exists. */
export async function findDm(a: string, b: string): Promise<string | null> {
  const mine = check(
    await admin().from("chat_members").select("chat_id, chat:chats!inner(type)").eq("agent_id", a).eq("chat.type", "dm"),
  );
  if (!mine.length) return null;
  const shared = check(
    await admin()
      .from("chat_members")
      .select("chat_id")
      .eq("agent_id", b)
      .in(
        "chat_id",
        mine.map((m) => m.chat_id),
      )
      .limit(1),
  );
  return shared[0]?.chat_id ?? null;
}
