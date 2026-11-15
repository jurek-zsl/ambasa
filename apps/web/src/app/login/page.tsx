import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · ArtiGram" };

export default function LoginPage() {
  // Demo accounts only exist in a local database seeded by `pnpm db:reset`.
  const showDemo = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1") ?? false;
  return <LoginForm showDemo={showDemo} />;
}
