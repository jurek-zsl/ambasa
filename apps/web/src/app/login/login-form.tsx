"use client";
import { Button, Input } from "@/components/app-ui";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "@/components/messenger/icons";
import { browserClient } from "@/lib/supabase/browser";
export function LoginForm({
  showDemo,
  recovery = false,
  callbackError = false,
}: {
  showDemo: boolean;
  recovery?: boolean;
  callbackError?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up" | "reset">(
    recovery ? "reset" : "in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(
    callbackError ? "That sign-in link has expired. Request a new one." : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const sb = browserClient();
    try {
      if (mode === "reset") {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        router.replace("/app");
      } else if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error)
          throw new Error(
            error.message === "Invalid login credentials"
              ? "That email and password don't match."
              : error.message,
          );
        router.replace("/app");
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { display_name: name.trim() },
          },
        });
        if (error) throw new Error(error.message);
        if (data.session) router.replace("/app");
        else setInfo("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function oauth(provider: "google" | "github") {
    setError(null);
    const { error } = await browserClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error)
      setError(
        error.message.includes("not enabled")
          ? `${provider} sign-in isn't set up on this server yet.`
          : error.message,
      );
  }
  async function magicLink() {
    setError(null);
    setInfo(null);
    if (!email) return setError("Enter your email first.");
    const { error } = await browserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setInfo("Check your email for a sign-in link.");
  }
  async function recover() {
    if (!email)
      return setError("Enter your email first, then request a reset link.");
    setBusy(true);
    setError(null);
    const { error } = await browserClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/login?recovery=1")}`,
    });
    if (error) setError(error.message);
    else
      setInfo(
        "If an account exists for this email, you’ll receive a password reset link.",
      );
    setBusy(false);
  }
  return (
    <main className="center">
      <form className="auth" onSubmit={submit}>
        <Mark />
        <div style={{ display: "grid", gap: 6 }}>
          <h1>
            {mode === "reset"
              ? "Set a new password"
              : mode === "in"
                ? "Sign in to Ambasa"
                : "Create your account"}
          </h1>
          <p>
            Watch your agents work, approve what matters and pause or redirect
            when you want.
          </p>
        </div>
        {mode === "up" ? (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
        ) : null}
        {mode !== "reset" ? (
          <div className="field">
            <label htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="password">Password</label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />
        </div>
        {mode === "in" ? (
          <Button
            className="auth-recover"
            type="button"
            disabled={busy}
            onClick={recover}
          >
            Forgot password?
          </Button>
        ) : null}
        {error ? (
          <div role="alert" className="error">
            {error}
          </div>
        ) : null}
        {info ? <div className="demo">{info}</div> : null}
        {mode !== "reset" ? (
          <div className="auth-alternatives">
            <Button
              className="btn sec"
              type="button"
              onClick={magicLink}
              disabled={busy}
            >
              Email me a sign-in link instead
            </Button>
            <div className="or">or continue with</div>
            <div className="oauth">
              <Button
                className="btn sec"
                type="button"
                onClick={() => oauth("google")}
              >
                Google
              </Button>
              <Button
                className="btn sec"
                type="button"
                onClick={() => oauth("github")}
              >
                GitHub
              </Button>
            </div>
          </div>
        ) : null}
        <Button
          className="btn pri"
          type="submit"
          disabled={busy}
          style={{ height: 42 }}
        >
          {busy
            ? "One moment…"
            : mode === "reset"
              ? "Save password"
              : mode === "in"
                ? "Sign in"
                : "Create account"}
        </Button>
        <div className="switch">
          {mode === "in" ? "New here? " : "Already have an account? "}
          <Button
            type="button"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? "Create an account" : "Sign in"}
          </Button>
        </div>
        {showDemo ? (
          <div className="demo">
            Local demo: sign in as <code>demo@ambasa.local</code> with password{" "}
            <code>ambasa-demo</code>.
          </div>
        ) : null}
      </form>
    </main>
  );
}
