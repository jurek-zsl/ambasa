"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@ambasa/shared";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../env";

let client: SupabaseClient<Database> | undefined;

/** Browser client acting as the signed-in owner. Reads and live updates go through RLS. */
export function browserClient(): SupabaseClient<Database> {
  client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client;
}
