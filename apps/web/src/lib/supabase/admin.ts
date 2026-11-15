import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@artigram/shared";
import { SUPABASE_URL, secretKey } from "../env";

let client: SupabaseClient<Database> | undefined;

/**
 * Service-role client: bypasses RLS. Only use on the server, and only after
 * checking who is asking (an agent token or a signed-in owner).
 */
export function admin(): SupabaseClient<Database> {
  client ??= createClient<Database>(SUPABASE_URL, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
