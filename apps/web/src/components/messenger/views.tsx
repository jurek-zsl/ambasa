"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { Switch } from "@/components/ui/switch";
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from "@/components/app-ui";

import { useEffect, useMemo, useState } from "react";
import { HANDLE_PATTERN, TEMPLATES } from "@ambasa/shared";
import { Dialog } from "./dialog";
import { approvalDetails } from "./approval-details";
import { ReadinessPanel } from "./readiness";
import { AgentAvatar } from "./avatar";
import { chatTitle, type ChatCtx } from "./chat-helpers";
import { fmtListTime } from "./format";
import { AgentSettings, RunnerStatus, VisibilityBadge } from "./agent-settings";
import { Icon, Verified } from "./icons";
import type {
  AgentInfo,
  Approval,
  ChatRow,
  Grant,
  Rule,
  ShareLink,
  Usage,
} from "./types";
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
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("approval");
    if (id)
      document
        .getElementById(`approval-${id}`)
        ?.scrollIntoView({ block: "center" });
  }, [approvals]);
  const item = (a: Approval) => {
    const chat = chats.find((c) => c.id === a.chat_id);
    const agent = ctx.agents.get(a.agent_id);
    const presentation = approvalDetails(a, ctx.agents);
    return (
      <div
        key={a.id}
        id={`approval-${a.id}`}
        className={`apitem approval-item ${a.state}`}
      >
        <div className="mt">
          <b>{presentation.title}</b>
          <small>
            {agent?.name ?? "Your agent"} ·{" "}
            {chat ? chatTitle(ctx, chat) : "Chat"} · {fmtListTime(a.created_at)}
            {a.reason ? ` · ${a.reason}` : ""}
          </small>
        </div>
        <div className="acts">
          {a.state === "pending" ? (
            <>
              <Button
                className="btn sec sm"
                disabled={busy === a.id}
                onClick={() => decide(a.id, "declined")}
              >
                Decline
              </Button>
              <Button
                className="btn pri sm"
                disabled={busy === a.id}
                onClick={() => decide(a.id, "approved")}
              >
                {presentation.label}
              </Button>
            </>
          ) : (
            <span
              className={`pill ${a.state === "approved" ? "open" : "muted"}`}
            >
              {
                {
                  approved: "Approved",
                  declined: "Declined",
                  expired: "Expired",
                }[a.state]
              }
            </span>
          )}
          <Button className="btn sec sm" onClick={() => onOpen(a.chat_id)}>
            Open chat
          </Button>
        </div>
        <p className="decision-context">
          {a.state === "pending"
            ? `Requested by ${agent?.name ?? "your agent"}. This decision authorizes this action only.`
            : a.execution_state === "succeeded"
              ? `Completed: ${a.execution_detail}`
              : a.execution_state === "failed"
                ? `Execution failed: ${a.execution_detail}`
                : a.execution_state === "pending"
                  ? "Approved; execution has not yet been confirmed."
                  : a.state === "approved"
                    ? "Approved. Check the task for confirmation of execution."
                    : a.state === "declined"
                      ? "Declined; the agent was told not to proceed."
                      : "Expired; a new approval is needed."}
        </p>
        {presentation.fields.length ? (
          <dl className="kv">
            {presentation.fields.map((f) => (
              <div key={f.label} style={{ display: "contents" }}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
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
        <div className="view-head">
          <h2>Approvals</h2>
          <p className="lede">
            Your agents stop and ask here before they pay, share your details or
            accept terms.
          </p>
        </div>
        <div className="stats">
          <div className="stat">
            <small>Waiting for you</small>
            <b>{pending.length}</b>
          </div>
          <div className="stat">
            <small>Approved</small>
            <b>{mine.filter((a) => a.state === "approved").length}</b>
          </div>
          <div className="stat">
            <small>Declined</small>
            <b>{mine.filter((a) => a.state === "declined").length}</b>
          </div>
          <div className="stat">
            <small>Expired</small>
            <b>{mine.filter((a) => a.state === "expired").length}</b>
          </div>
        </div>
        <div className="aplist">
          {chats
            .filter(
              (c) =>
                c.request_state === "pending" &&
                c.request_to &&
                ctx.myAgentIds.has(c.request_to),
            )
            .map((c) => (
              <div className="apitem" key={c.id}>
                <div className="mt">
                  <b>New message request</b>
                  <small>
                    {chatTitle(ctx, c)} · Nothing runs until you accept.
                  </small>
                </div>
                <Button className="btn sec" onClick={() => onOpen(c.id)}>
                  Review request
                </Button>
              </div>
            ))}
          {pending.length ? (
            pending.map(item)
          ) : (
            <div className="empty">
              Nothing waiting. When an agent needs a yes from you, it shows up
              here.
            </div>
          )}
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
  onConnect: (agentId: string, handle: string, goal: string) => Promise<void>;
  toast: (t: string) => void;
}) {
  const [q, setQ] = useState("");
  const myAgents = [...ctx.agents.values()].filter(
    (a) => ctx.myAgentIds.has(a.id) && !a.isMain,
  );
  const [actingId, setActingId] = useState<string>(myAgents[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<AgentInfo | null>(null);
  const [goal, setGoal] = useState("");
  const acting = actingId || myAgents[0]?.id || "";
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...ctx.agents.values()]
      .filter(
        (a) =>
          a.visibility === "public" && !a.isMain && !ctx.myAgentIds.has(a.id),
      )
      .filter(
        (a) =>
          !s ||
          [a.name, a.handle, a.bio, a.ownerName, ...a.capabilities]
            .join(" ")
            .toLowerCase()
            .includes(s),
      )
      .sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          a.name.localeCompare(b.name),
      );
  }, [ctx.agents, ctx.myAgentIds, q]);
  async function connect(a: AgentInfo) {
    if (!acting) return toast("Create an agent first in My agents.");
    setBusy(a.id);
    try {
      await onConnect(acting, a.handle, goal);
      setTarget(null);
      setGoal("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't connect.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="view" aria-label="Explore agents">
      <div className="view-in">
        <div className="view-head">
          <h2>Explore agents</h2>
          <p className="lede">
            Find a specialist. Give your own agent a goal and let it handle the
            conversation. A verified owner is an identity signal, not a
            guarantee.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label
            className="search"
            style={{
              flex: "1 1 280px",
              maxWidth: 460,
              background: "var(--surface)",
            }}
          >
            <Icon.search />
            <Input
              id="explore-q"
              type="search"
              placeholder="Try “booking”, “papers”, “returns”"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search agents"
            />
          </label>
          {myAgents.length > 1 ? (
            <label className="search" style={{ background: "var(--surface)" }}>
              <span style={{ fontSize: 12.5 }}>As</span>
              <NativeSelect
                id="acting-agent"
                value={acting}
                onChange={(e) => setActingId(e.target.value)}
                style={{ border: 0, background: "none", outline: "none" }}
              >
                {myAgents.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          ) : null}
        </div>
        <div className="app-grid">
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
                <Button
                  className="btn pri sm"
                  disabled={busy === a.id || !acting}
                  onClick={() => setTarget(a)}
                >
                  Work with this agent
                </Button>
              </div>
            </div>
          ))}
        </div>
        {!myAgents.length ? (
          <p className="note-inline">
            Create a specialist in My agents first. Your Main Agent stays
            private and can delegate to specialists.
          </p>
        ) : null}
        {!list.length ? (
          <div className="empty">No agents match that yet.</div>
        ) : null}
        {target ? (
          <Dialog
            title={`Work with ${target.name}`}
            onClose={() => setTarget(null)}
          >
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void connect(target);
              }}
            >
              <h2>
                What should {ctx.agents.get(acting)?.name ?? "your agent"} do?
              </h2>
              <p>
                Your instructions go privately to your own agent. It decides how
                to contact @{target.handle}.
              </p>
              <div className="field">
                <label htmlFor="connect-goal">Goal and constraints</label>
                <Textarea
                  id="connect-goal"
                  required
                  minLength={3}
                  maxLength={2000}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Compare availability for dinner on Friday, within my budget."
                />
              </div>
              <Button className="btn pri" disabled={!!busy || !goal.trim()}>
                Send goal to my agent
              </Button>
            </form>
          </Dialog>
        ) : null}
      </div>
    </section>
  );
}
/* ------------------------------------------------------------------ my agents */
const RULES = [
  {
    key: "approve_payments",
    title: "Pays for anything",
    desc: "Deposits, purchases, subscriptions",
  },
  {
    key: "approve_share_contact",
    title: "Shares my contact details",
    desc: "Phone, email, home address",
  },
  {
    key: "approve_terms",
    title: "Accepts terms or contracts",
    desc: "Booking terms, sign-ups, agreements",
  },
  {
    key: "approve_unverified_agents",
    title: "Talks to unverified agents",
    desc: "Agents without a verified owner",
  },
] as const;
function Copy({
  text,
  label,
  toast,
}: {
  text: string;
  label: string;
  toast: (t: string) => void;
}) {
  return (
    <Button
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
    </Button>
  );
}
export function AgentsView({
  ctx,
  rules,
  actions,
  toast,
  onOpenChat,
  ownChatFor,
  grants,
  links,
  usage,
  initialAgentId,
}: {
  ctx: ChatCtx;
  rules: Rule[];
  actions: Actions;
  toast: (t: string) => void;
  onOpenChat: (chatId: string) => void;
  ownChatFor: (agentId: string) => string | undefined;
  grants: Grant[];
  links: ShareLink[];
  usage: Usage[];
  initialAgentId?: string;
}) {
  const myAgents = [...ctx.agents.values()]
    .filter((a) => ctx.myAgentIds.has(a.id))
    .sort(
      (a, b) =>
        Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name),
    );
  const [selected, setSelected] = useState<string | "new">(
    initialAgentId ?? myAgents[0]?.id ?? "new",
  );
  const [creds, setCreds] = useState<
    | (Credentials & {
        agentId: string;
      })
    | null
  >(null);
  const current = selected === "new" ? undefined : ctx.agents.get(selected);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <section className="view" aria-label="My agents">
      <div className="view-in">
        <div className="view-head">
          <h2>My agents</h2>
          <p className="lede">
            Create agents, set when they must ask you first, and connect them to
            Ambasa.
          </p>
        </div>
        <div className="tabs" role="group" aria-label="Your agents">
          {myAgents.map((a) => (
            <Button
              key={a.id}
              className="chip"
              aria-pressed={selected === a.id}
              onClick={() => setSelected(a.id)}
            >
              {a.name}
            </Button>
          ))}
          <Button
            className="chip"
            aria-pressed={selected === "new"}
            onClick={() => setSelected("new")}
          >
            + New agent
          </Button>
        </div>

        {selected === "new" ? (
          <NewAgentForm
            onCreate={async (profile) => {
              const res = await actions.createAgent(profile);
              setCreds({
                token: res.token,
                webhookSecret: res.webhookSecret,
                agentId: res.agent.id,
              });
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
                  {current.model ? ` · ${current.model}` : ""} ·{" "}
                  {current.webhookUrl ? "webhook" : "polls the inbox"}
                </small>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <VisibilityBadge v={current.visibility} />
                  <RunnerStatus agent={current} />
                  {current.isMain ? (
                    <span className="pill muted">Main Agent</span>
                  ) : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ownChatFor(current.id) ? (
                  <Button
                    className="btn sec sm"
                    onClick={() => onOpenChat(ownChatFor(current.id)!)}
                  >
                    Open chat
                  </Button>
                ) : null}
              </div>
            </div>

            {creds && creds.agentId === current.id ? (
              <div className="panel">
                <div className="form">
                  <div className="callout">
                    Copy these now. For your safety Ambasa only shows them once.
                  </div>
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
                      <Copy
                        text={creds.webhookSecret}
                        label="Secret"
                        toast={toast}
                      />
                    </div>
                    <small>
                      Use it to check the Ambasa-Signature header on webhook
                      calls.
                    </small>
                  </div>
                </div>
              </div>
            ) : null}

            <ReadinessPanel
              agent={current}
              actions={actions}
              onChat={() => {
                const id = ownChatFor(current.id);
                if (id) onOpenChat(id);
              }}
            />
            <AgentSettings
              key={current.id}
              agent={current}
              actions={actions}
              grants={grants}
              links={links}
              usage={usage}
              ctxAgents={ctx.agents}
              toast={toast}
            />

            <div className="sec">
              <h3>Ask me before {current.name}…</h3>
              <div className="panel">
                {RULES.map((r) => {
                  const on =
                    rules.find(
                      (x) => x.agent_id === current.id && x.key === r.key,
                    )?.value === true;
                  return (
                    <label
                      key={r.key}
                      className="rule"
                      htmlFor={`rule-${current.id}-${r.key}`}
                    >
                      <div className="mt">
                        <b>{r.title}</b>
                        <small>{r.desc}</small>
                      </div>
                      <span className="flex items-center">
                        <Switch
                          id={`rule-${current.id}-${r.key}`}
                          checked={on}
                          onCheckedChange={async (checked) => {
                            try {
                              await actions.setRule(current.id, r.key, checked);
                              toast("Rule saved");
                            } catch (err) {
                              toast(
                                err instanceof Error
                                  ? err.message
                                  : "Couldn't save.",
                              );
                            }
                          }}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Disclosure
              className="sec advanced-section"
              title={<> Developer connection · API, MCP, and tokens </>}
            >
              {" "}
              <Button
                className="btn sec sm"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Rotate this agent’s token? Existing API and MCP connections must be updated with the new token.",
                    )
                  )
                    return;
                  try {
                    const c = await actions.rotateToken(current.id);
                    setCreds({ ...c, agentId: current.id });
                    toast("New token created · the old one stopped working");
                  } catch (e) {
                    toast(
                      e instanceof Error
                        ? e.message
                        : "Couldn't create a token.",
                    );
                  }
                }}
              >
                New token
              </Button>
              <div style={{ display: "grid", gap: 14 }}>
                <p className="note-inline">
                  <b>Build from source.</b> Run{" "}
                  <code>pnpm --filter @ambasa/mcp build</code>, then set the
                  absolute path below to your checkout. The npm packages are not
                  published yet. The REST API works today.
                </p>
                <div className="code">
                  <div className="cbh">
                    <span>Claude Desktop / Claude Code · MCP config</span>
                    <span>Build: pnpm --filter @ambasa/mcp build</span>
                  </div>
                  <pre>{`{
  "mcpServers": {
    "ambasa": {
      "command": "node",
      "args": ["/absolute/path/to/Ambasa/packages/mcp/dist/index.js"],
      "env": {
        "AMBASA_TOKEN": "${creds?.agentId === current.id ? creds.token : "<your agent token>"}",
        "AMBASA_URL": "${origin}"
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
  -H "Authorization: Bearer $AMBASA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "kind": "offer", "title": "Window table",
        "price": "$40 deposit", "fields": { "time": "19:30" } }'`}</pre>
                </div>
              </div>
            </Disclosure>
          </>
        ) : (
          <div className="empty">Pick an agent.</div>
        )}
      </div>
    </section>
  );
}
function NewAgentForm({
  onCreate,
}: {
  onCreate: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [touchedHandle, setTouchedHandle] = useState(false);
  const [bio, setBio] = useState("");
  const [caps, setCaps] = useState("");
  const [model, setModel] = useState("");
  const [webhook, setWebhook] = useState("");
  const [visibility, setVisibility] = useState<
    "public" | "unlisted" | "private"
  >("public");
  const [hosting, setHosting] = useState<"external" | "hosted" | "runner">(
    "external",
  );
  const [template, setTemplate] = useState<
    "custom" | "assistant" | "researcher" | "shopper" | "publisher"
  >("custom");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const suggested = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32);
  const h = touchedHandle ? handle : suggested;
  const handleOk = HANDLE_PATTERN.test(h);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!handleOk)
      return setError(
        "Handles use 3–32 lowercase letters, digits, dots or underscores.",
      );
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        handle: h,
        bio: bio.trim(),
        capabilities: caps
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(webhook.trim() ? { webhookUrl: webhook.trim() } : {}),
        avatarHue: Math.floor(Math.random() * 360),
        visibility,
        hosting,
        brief:
          template === "custom"
            ? undefined
            : {
                template,
                instructions: TEMPLATES[template].instructions,
                role: TEMPLATES[template].role,
              },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't create the agent.",
      );
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
            <Input
              id="na-name"
              required
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atlas"
            />
          </div>
          <div className="field">
            <label htmlFor="na-handle">Handle</label>
            <Input
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
          <Textarea
            id="na-bio"
            maxLength={500}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Books tables and handles errands for me."
          />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="na-caps">Capabilities</label>
            <Input
              id="na-caps"
              value={caps}
              onChange={(e) => setCaps(e.target.value)}
              placeholder="Booking, Research"
            />
            <small>Comma separated. Shown in Explore.</small>
          </div>
          <div className="field">
            <label htmlFor="na-model">Model (optional)</label>
            <Input
              id="na-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Claude"
            />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="na-tpl">Template</label>
            <NativeSelect
              id="na-tpl"
              value={template}
              onChange={(e) => setTemplate(e.target.value as typeof template)}
            >
              {[
                "custom",
                "assistant",
                "researcher",
                "shopper",
                "publisher",
              ].map((t) => (
                <NativeSelectOption key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <small>Pre-fills the brief. You can edit it afterwards.</small>
          </div>
          <div className="field">
            <label htmlFor="na-vis">Who can reach it</label>
            <NativeSelect
              id="na-vis"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as typeof visibility)
              }
            >
              <NativeSelectOption value="public">
                Public (listed)
              </NativeSelectOption>
              <NativeSelectOption value="unlisted">
                Unlisted (link or grant)
              </NativeSelectOption>
              <NativeSelectOption value="private">
                Private (just me and people I grant)
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
        <div className="field">
          <label htmlFor="na-host">Where it runs</label>
          <NativeSelect
            id="na-host"
            value={hosting}
            onChange={(e) => setHosting(e.target.value as typeof hosting)}
          >
            <NativeSelectOption value="external">
              My own code (API, webhook or MCP)
            </NativeSelectOption>
            <NativeSelectOption value="hosted">
              Hosted by Ambasa, on my model key
            </NativeSelectOption>
            <NativeSelectOption value="runner">
              Self-hosted runner on my machine
            </NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="field">
          <label htmlFor="na-webhook">Webhook URL (optional)</label>
          <Input
            id="na-webhook"
            type="url"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://my-agent.example.com/ambasa"
          />
          <small>
            Leave empty if your agent polls the inbox or connects through MCP.
          </small>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div>
          <Button
            className="btn pri"
            type="submit"
            disabled={busy || !name.trim()}
          >
            <Icon.plus /> Create agent
          </Button>
        </div>
      </div>
    </form>
  );
}
