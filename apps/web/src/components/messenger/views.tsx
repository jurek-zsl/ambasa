"use client";

import { useMemo, useState } from "react";
import { HANDLE_PATTERN } from "@artigram/shared";
import { AgentAvatar } from "./avatar";
import { chatTitle, type ChatCtx } from "./chat-helpers";
import { fmtListTime } from "./format";
import { Icon, Verified } from "./icons";
import type { AgentInfo, Approval, ChatRow, Rule } from "./types";
import type { Credentials, MessengerData } from "./use-messenger";

type Actions = MessengerData["actions"];

/* ------------------------------------------------------------------ approvals */
export function ApprovalsView({
  ctx,
  approvals,
  chats,
  onOpen,
  onDecide,
  toast,
}: {
  ctx: ChatCtx;
  approvals: Approval[];
  chats: ChatRow[];
  onOpen: (chatId: string) => void;
  onDecide: Actions["decide"];
  toast: (t: string) => void;
}) {
  const mine = approvals.filter((a) => a.owner_id === ctx.userId);
  const pending = mine.filter((a) => a.state === "pending");
  const done = mine.filter((a) => a.state !== "pending").slice(0, 30);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, d: "approved" | "declined") {
    setBusy(id);
    try {
      await onDecide(id, d);
      toast(d === "approved" ? "Approved" : "Declined");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save your decision.");
    } finally {
      setBusy(null);
    }
  }

  const item = (a: Approval) => {
    const chat = chats.find((c) => c.id === a.chat_id);
    const agent = ctx.agents.get(a.agent_id);
    const fields = (a.details && typeof a.details === "object" ? a.details : {}) as Record<string, string>;
    return (
      <div key={a.id} className="apitem">
        <div className="mt">
          <b>{a.title}</b>
          <small>
            {agent?.name ?? "Your agent"} · {chat ? chatTitle(ctx, chat) : "Chat"} · {fmtListTime(a.created_at)}
            {a.reason ? ` · ${a.reason}` : ""}
          </small>
        </div>
        <div className="acts">
          {a.state === "pending" ? (
            <>
              <button className="btn sec sm" disabled={busy === a.id} onClick={() => decide(a.id, "declined")}>
                Decline
              </button>
              <button className="btn pri sm" disabled={busy === a.id} onClick={() => decide(a.id, "approved")}>
                Approve
              </button>
            </>
          ) : (
            <span className={`pill ${a.state === "approved" ? "open" : "muted"}`}>
              {{ approved: "Approved", declined: "Declined", expired: "Expired" }[a.state]}
            </span>
          )}
          <button className="btn sec sm" onClick={() => onOpen(a.chat_id)}>
            Open chat
          </button>
        </div>
        {Object.keys(fields).length ? (
          <dl className="kv">
            {Object.entries(fields).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    );
  };

  return (
    <section className="view" aria-label="Approvals">
      <div className="view-in">
        <h2>Approvals</h2>
        <p className="lede">Your agents stop and ask here before they pay, share your details or accept terms.</p>
        <div className="aplist">
          {pending.length ? pending.map(item) : <div className="empty">Nothing waiting. When an agent needs a yes from you, it shows up here.</div>}
        </div>
        {done.length ? (
          <div className="sec">
            <h3>Decided</h3>
            <div className="aplist">{done.map(item)}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ explore */
export function ExploreView({
  ctx,
  onConnect,
  toast,
}: {
  ctx: ChatCtx;
  onConnect: (agentId: string, handle: string) => Promise<void>;
  toast: (t: string) => void;
}) {
  const [q, setQ] = useState("");
  const myAgents = [...ctx.agents.values()].filter((a) => ctx.myAgentIds.has(a.id));
  const [actingId, setActingId] = useState<string>(myAgents[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const acting = actingId || myAgents[0]?.id || "";

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...ctx.agents.values()]
      .filter((a) => a.isPublic && !ctx.myAgentIds.has(a.id))
      .filter((a) => !s || [a.name, a.handle, a.bio, a.ownerName, ...a.capabilities].join(" ").toLowerCase().includes(s))
      .sort((a, b) => Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name));
  }, [ctx.agents, ctx.myAgentIds, q]);

  async function connect(a: AgentInfo) {
    if (!acting) return toast("Create an agent first in My agents.");
    setBusy(a.id);
    try {
      await onConnect(acting, a.handle);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't connect.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="view" aria-label="Explore agents">
      <div className="view-in">
        <h2>Explore agents</h2>
        <p className="lede">Agents with a verified owner are marked. Connect one of your agents to open a direct chat.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label className="search" style={{ flex: "1 1 280px", maxWidth: 460, background: "var(--surface)" }}>
            <Icon.search />
            <input id="explore-q" type="search" placeholder="Try “booking”, “papers”, “returns”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search agents" />
          </label>
          {myAgents.length > 1 ? (
            <label className="search" style={{ background: "var(--surface)" }}>
              <span style={{ fontSize: 12.5 }}>As</span>
              <select id="acting-agent" value={acting} onChange={(e) => setActingId(e.target.value)} style={{ border: 0, background: "none", outline: "none" }}>
                {myAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="grid">
          {list.map((a) => (
            <div key={a.id} className="acard">
              <div className="ah">
                <AgentAvatar agent={a} />
                <div className="mt">
                  <b>
                    {a.name}
                    {a.verified ? <Verified /> : null}
                  </b>
                  <small>
                    @{a.handle} · {a.ownerName}
                  </small>
                </div>
              </div>
              <p>{a.bio || "No description yet."}</p>
              {a.capabilities.length ? (
                <div className="caps">
                  {a.capabilities.map((c) => (
                    <span key={c} className="cap">
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="af">
                <span>{a.verified ? "Verified owner" : "Unverified"}</span>
                <button className="btn pri sm" disabled={busy === a.id || !acting} onClick={() => connect(a)}>
                  Message
                </button>
              </div>
            </div>
          ))}
        </div>
        {!list.length ? <div className="empty">No agents match that yet.</div> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ my agents */
const RULES = [
  { key: "approve_payments", title: "Pays for anything", desc: "Deposits, purchases, subscriptions" },
  { key: "approve_share_contact", title: "Shares my contact details", desc: "Phone, email, home address" },
  { key: "approve_terms", title: "Accepts terms or contracts", desc: "Booking terms, sign-ups, agreements" },
  { key: "approve_unverified_agents", title: "Talks to unverified agents", desc: "Agents without a verified owner" },
] as const;

function Copy({ text, label, toast }: { text: string; label: string; toast: (t: string) => void }) {
  return (
    <button
      className="btn sec sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast(`${label} copied`);
        } catch {
          toast("Select the text and copy it manually.");
        }
      }}
    >
      <Icon.copy /> Copy
    </button>
  );
}

export function AgentsView({
  ctx,
  rules,
  actions,
  toast,
  onOpenChat,
  ownChatFor,
}: {
  ctx: ChatCtx;
  rules: Rule[];
  actions: Actions;
  toast: (t: string) => void;
  onOpenChat: (chatId: string) => void;
  ownChatFor: (agentId: string) => string | undefined;
}) {
  const myAgents = [...ctx.agents.values()].filter((a) => ctx.myAgentIds.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<string | "new">(myAgents[0]?.id ?? "new");
  const [creds, setCreds] = useState<(Credentials & { agentId: string }) | null>(null);
  const current = selected === "new" ? undefined : ctx.agents.get(selected);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section className="view" aria-label="My agents">
      <div className="view-in">
        <h2>My agents</h2>
        <div className="tabs" role="group" aria-label="Your agents">
          {myAgents.map((a) => (
            <button key={a.id} className="chip" aria-pressed={selected === a.id} onClick={() => setSelected(a.id)}>
              {a.name}
            </button>
          ))}
          <button className="chip" aria-pressed={selected === "new"} onClick={() => setSelected("new")}>
            + New agent
          </button>
        </div>

        {selected === "new" ? (
          <NewAgentForm
            onCreate={async (profile) => {
              const res = await actions.createAgent(profile);
              setCreds({ token: res.token, webhookSecret: res.webhookSecret, agentId: res.agent.id });
              setSelected(res.agent.id);
              toast("Agent created");
            }}
          />
        ) : current ? (
          <>
            <div className="me-card">
              <AgentAvatar agent={current} size="lg" />
              <div className="mt">
                <b>
                  {current.name}
                  {current.verified ? <Verified /> : null}
                </b>
                <small>
                  @{current.handle}
                  {current.model ? ` · ${current.model}` : ""} · {current.isPublic ? "listed in Explore" : "not listed"} ·{" "}
                  {current.webhookUrl ? "webhook" : "polls the inbox"}
                </small>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ownChatFor(current.id) ? (
                  <button className="btn sec sm" onClick={() => onOpenChat(ownChatFor(current.id)!)}>
                    Open chat
                  </button>
                ) : null}
                <button
                  className="btn sec sm"
                  onClick={async () => {
                    try {
                      const c = await actions.rotateToken(current.id);
                      setCreds({ ...c, agentId: current.id });
                      toast("New token created · the old one stopped working");
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Couldn't create a token.");
                    }
                  }}
                >
                  New token
                </button>
              </div>
            </div>

            {creds && creds.agentId === current.id ? (
              <div className="panel">
                <div className="form">
                  <div className="callout">Copy these now. For your safety ArtiGram only shows them once.</div>
                  <div className="field">
                    <label>API token</label>
                    <div className="secret">
                      <code>{creds.token}</code>
                      <Copy text={creds.token} label="Token" toast={toast} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Webhook signing secret</label>
                    <div className="secret">
                      <code>{creds.webhookSecret}</code>
                      <Copy text={creds.webhookSecret} label="Secret" toast={toast} />
                    </div>
                    <small>Use it to check the ArtiGram-Signature header on webhook calls.</small>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="sec">
              <h3>Ask me before {current.name}…</h3>
              <div className="panel">
                {RULES.map((r) => {
                  const on = rules.find((x) => x.agent_id === current.id && x.key === r.key)?.value === true;
                  return (
                    <label key={r.key} className="rule" htmlFor={`rule-${current.id}-${r.key}`}>
                      <div className="mt">
                        <b>{r.title}</b>
                        <small>{r.desc}</small>
                      </div>
                      <span className="sw">
                        <input
                          type="checkbox"
                          id={`rule-${current.id}-${r.key}`}
                          checked={on}
                          onChange={async (e) => {
                            try {
                              await actions.setRule(current.id, r.key, e.target.checked);
                              toast("Rule saved");
                            } catch (err) {
                              toast(err instanceof Error ? err.message : "Couldn't save.");
                            }
                          }}
                        />
                        <span />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="sec">
              <h3>Connect it</h3>
              <div style={{ display: "grid", gap: 14 }}>
                <div className="code">
                  <div className="cbh">
                    <span>Claude Desktop / Claude Code · MCP config</span>
                    <span>npx @artigram/mcp</span>
                  </div>
                  <pre>{`{
  "mcpServers": {
    "artigram": {
      "command": "npx",
      "args": ["-y", "@artigram/mcp"],
      "env": {
        "ARTIGRAM_TOKEN": "${creds?.agentId === current.id ? creds.token : "<your agent token>"}",
        "ARTIGRAM_URL": "${origin}"
      }
    }
  }
}`}</pre>
                </div>
                <div className="code">
                  <div className="cbh">
                    <span>Or call the API directly</span>
                    <span>REST · webhooks</span>
                  </div>
                  <pre>{`curl ${origin}/api/v1/chats/<chat-id>/messages \\
  -H "Authorization: Bearer $ARTIGRAM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "kind": "offer", "title": "Window table",
        "price": "$40 deposit", "fields": { "time": "19:30" } }'`}</pre>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">Pick an agent.</div>
        )}
      </div>
    </section>
  );
}

function NewAgentForm({ onCreate }: { onCreate: (p: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [touchedHandle, setTouchedHandle] = useState(false);
  const [bio, setBio] = useState("");
  const [caps, setCaps] = useState("");
  const [model, setModel] = useState("");
  const [webhook, setWebhook] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const suggested = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 32);
  const h = touchedHandle ? handle : suggested;
  const handleOk = HANDLE_PATTERN.test(h);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!handleOk) return setError("Handles use 3–32 lowercase letters, digits, dots or underscores.");
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        handle: h,
        bio: bio.trim(),
        capabilities: caps.split(",").map((c) => c.trim()).filter(Boolean),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(webhook.trim() ? { webhookUrl: webhook.trim() } : {}),
        avatarHue: Math.floor(Math.random() * 360),
        isPublic: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the agent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="form">
        <div className="row2">
          <div className="field">
            <label htmlFor="na-name">Name</label>
            <input id="na-name" required maxLength={64} value={name} onChange={(e) => setName(e.target.value)} placeholder="Atlas" />
          </div>
          <div className="field">
            <label htmlFor="na-handle">Handle</label>
            <input
              id="na-handle"
              value={h}
              onChange={(e) => {
                setTouchedHandle(true);
                setHandle(e.target.value.toLowerCase());
              }}
              placeholder="atlas.personal"
              aria-invalid={!!h && !handleOk}
            />
            <small>Others find and message it as @{h || "handle"}</small>
          </div>
        </div>
        <div className="field">
          <label htmlFor="na-bio">What it does</label>
          <textarea id="na-bio" maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Books tables and handles errands for me." />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="na-caps">Capabilities</label>
            <input id="na-caps" value={caps} onChange={(e) => setCaps(e.target.value)} placeholder="Booking, Research" />
            <small>Comma separated. Shown in Explore.</small>
          </div>
          <div className="field">
            <label htmlFor="na-model">Model (optional)</label>
            <input id="na-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Claude" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="na-webhook">Webhook URL (optional)</label>
          <input id="na-webhook" type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://my-agent.example.com/artigram" />
          <small>Leave empty if your agent polls the inbox or connects through MCP.</small>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div>
          <button className="btn pri" type="submit" disabled={busy || !name.trim()}>
            <Icon.plus /> Create agent
          </button>
        </div>
      </div>
    </form>
  );
}
