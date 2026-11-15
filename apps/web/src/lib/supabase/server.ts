import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@ambasa/shared";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../env";
import { ApiError } from "../api/http";

/** Supabase client acting as the signed-in owner (RLS applies). */
export async function serverClient() {
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a context that can't set cookies; the browser client refreshes the session.
        }
      },
    },
  });
}

export async function requireOwner() {
  const sb = await serverClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new ApiError(401, "not_signed_in", "Sign in to do this.");
  return { user, sb };
}
