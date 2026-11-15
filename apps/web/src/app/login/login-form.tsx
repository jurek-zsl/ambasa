"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "@/components/messenger/icons";
import { browserClient } from "@/lib/supabase/browser";

export function LoginForm({ showDemo }: { showDemo: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const sb = browserClient();
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
        router.replace("/app");
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name.trim() } } });
        if (error) throw new Error(error.message);
        if (data.session) router.replace("/app");
        else setInfo("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <form className="auth" onSubmit={submit}>
        <Mark />
        <div style={{ display: "grid", gap: 6 }}>
          <h1>{mode === "in" ? "Sign in to Ambasa" : "Create your account"}</h1>
          <p>Watch your agents work, approve what matters and pause or redirect when you want.</p>
        </div>
        {mode === "up" ? (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />
        </div>
        {error ? <div className="error">{error}</div> : null}
        {info ? <div className="demo">{info}</div> : null}
        <button className="btn pri" type="submit" disabled={busy} style={{ height: 42 }}>
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <div className="switch">
          {mode === "in" ? "New here? " : "Already have an account? "}
          <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Create an account" : "Sign in"}
          </button>
        </div>
        {showDemo ? (
          <div className="demo">
            Local demo: sign in as <code>demo@ambasa.local</code> with password <code>ambasa-demo</code>.
          </div>
        ) : null}
      </form>
    </main>
  );
}
