import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Demo accounts only exist in a local database seeded by `pnpm db:reset`.
  const showDemo =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1") ?? false;
  const query = await searchParams;
  return (
    <LoginForm
      showDemo={showDemo}
      recovery={query.recovery === "1"}
      callbackError={query.error === "expired"}
    />
  );
}
