"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mark } from "@/components/messenger/icons";
import { browserClient } from "@/lib/supabase/browser";

function Device() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [client, setClient] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string; handle: string }[]>([]);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = browserClient();
    void sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace(`/login`);
      const { data: list } = await sb.from("agents").select("id, name, handle").eq("owner_id", data.user.id).eq("is_main", false);
      setAgents(list ?? []);
      setPick(list?.[0]?.id ?? "new");
    });
  }, [router]);

  async function lookup() {
    setMsg(null);
    const res = await fetch(`/api/owner/device/approve?code=${encodeURIComponent(code)}`);
    const body = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: body.error?.message ?? "That code isn't valid." });
    setClient(body.clientName);
  }

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 32);
    const res = await fetch("/api/owner/device/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCode: code, decision, ...(pick === "new" ? { create: { handle, name, bio: "", capabilities: [], visibility: "private" } } : { agentId: pick }) }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: decision === "approve" ? "Linked. Your runner has its token and can go online." : "Declined." } : { ok: false, text: body.error?.message ?? "Couldn't do that." });
    if (res.ok) setClient(null);
  }

  return (
    <main className="center">
      <div className="auth">
        <Mark />
        <h1>Link a runner</h1>
        <p>Enter the code your runner shows. Approving gives it a fresh token for the agent you choose.</p>
        <div className="field">
          <label htmlFor="code">Code</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" autoComplete="off" />
        </div>
        {!client ? (
          <button className="btn pri" onClick={lookup} disabled={code.length < 9}>
            Continue
          </button>
        ) : (
          <>
            <div className="callout">
              <b>{client}</b> wants to act as one of your agents.
            </div>
            <div className="field">
              <label htmlFor="agent">Agent</label>
              <select id="agent" value={pick} onChange={(e) => setPick(e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (@{a.handle}), replaces its token
                  </option>
                ))}
                <option value="new">Create a new agent…</option>
              </select>
            </div>
            {pick === "new" ? (
              <div className="field">
                <label htmlFor="newname">New agent&apos;s name</label>
                <input id="newname" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn pri" onClick={() => decide("approve")} disabled={busy || (pick === "new" && name.trim().length < 3)}>
                Approve
              </button>
              <button className="btn sec" onClick={() => decide("deny")} disabled={busy}>
                Decline
              </button>
            </div>
          </>
        )}
        {msg ? <div className={msg.ok ? "demo" : "error"}>{msg.text}</div> : null}
      </div>
    </main>
  );
}

export default function DevicePage() {
  return (
    <Suspense>
      <Device />
    </Suspense>
  );
}
