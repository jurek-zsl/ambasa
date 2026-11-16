"use client";
import { Disclosure } from "@/components/ui/disclosure";
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from "@/components/app-ui";

import { useEffect, useState, useRef } from "react";
import {
  BRIEF_TEMPLATES,
  INBOUND_POLICIES,
  MESSAGE_KINDS,
  TEMPLATES,
  VISIBILITIES,
  budgetStatus,
} from "@ambasa/shared";
import { fmtListTime } from "./format";
import type { AgentInfo, Brief, Grant, ShareLink, Usage } from "./types";
import type { MessengerData } from "./use-messenger";
type Actions = MessengerData["actions"];
interface Props {
  agent: AgentInfo;
  actions: Actions;
  grants: Grant[];
  links: ShareLink[];
  usage: Usage[];
  ctxAgents: Map<string, AgentInfo>;
  toast: (t: string) => void;
}
const VIS_COPY = {
  public:
    "Listed in Explore. Any agent can reach it, within its inbound policy.",
  unlisted: "Not listed. Only agents holding your link, or people you grant.",
  private:
    "Only your own agents and people you grant. Everyone else gets a 404.",
} as const;
const POLICY_COPY = {
  anyone: "Anyone",
  verified: "Verified agents only",
  contacts: "Contacts only",
  requests: "Message requests (a stranger's first message waits for you)",
} as const;
export function VisibilityBadge({ v }: { v: AgentInfo["visibility"] }) {
  return (
    <span className={`pill vis-${v}`}>
      {v === "public" ? "Public" : v === "unlisted" ? "Unlisted" : "Private"}
    </span>
  );
}
/** Runner status: hosted agents run on our worker, self-hosted ones report in when their runner is online. */
export function RunnerStatus({ agent }: { agent: AgentInfo }) {
  if (agent.stopped) return <span className="pill muted">Stopped</span>;
  if (agent.hosting === "hosted")
    return <span className="pill open">Hosted</span>;
  if (agent.hosting === "runner") {
    return (
      <span className={`pill ${agent.runnerOnline ? "open" : "muted"}`}>
        {agent.runnerOnline ? "Runner online" : "Runner offline"}
      </span>
    );
  }
  return <span className="pill muted">Your own agent</span>;
}
export function BudgetMeter({
  agent,
  usage,
}: {
  agent: AgentInfo;
  usage: Usage[];
}) {
  const u = usage.find((x) => x.agent_id === agent.id);
  const b = budgetStatus(
    { messages: u?.messages ?? 0, tokens: Number(u?.tokens ?? 0) },
    {
      dailyMessageCap: agent.dailyMessageCap,
      dailyTokenCap: agent.dailyTokenCap,
    },
  );
  return (
    <div
      className="meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={agent.dailyTokenCap}
      aria-valuenow={Number(u?.tokens ?? 0)}
      aria-label="Tokens used today"
    >
      <div className="bar">
        <span
          style={{ width: `${Math.round(b.fraction * 100)}%` }}
          data-high={b.fraction > 0.85 ? "" : undefined}
        />
      </div>
      <small>
        {Number(u?.tokens ?? 0).toLocaleString()} /{" "}
        {agent.dailyTokenCap.toLocaleString()} tokens today · {u?.messages ?? 0}{" "}
        / {agent.dailyMessageCap} messages
        {!b.ok ? " · out of budget, replying “busy”" : ""}
      </small>
    </div>
  );
}
export function AgentSettings({
  agent,
  actions,
  grants,
  links,
  usage,
  ctxAgents,
  toast,
}: Props) {
  const save = async (patch: Record<string, unknown>, ok = "Saved") => {
    try {
      await actions.updateAgent(agent.id, patch);
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.");
    }
  };
  const [caps, setCaps] = useState({
    tok: String(agent.dailyTokenCap),
    msg: String(agent.dailyMessageCap),
    steps: String(agent.maxToolSteps),
    cold: String(agent.coldContactCap),
  });
  const mineGrants = grants.filter((g) => g.agent_id === agent.id);
  const mineLinks = links.filter((l) => l.agent_id === agent.id);
  return (
    <>
      <div className="sec">
        <h3>Model connection</h3>{" "}
        <div className="field">
          <label htmlFor={`host-${agent.id}`}>Where it runs</label>
          <NativeSelect
            id={`host-${agent.id}`}
            value={agent.hosting}
            onChange={(e) => save({ hosting: e.target.value })}
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
      </div>
      <BriefEditor agent={agent} actions={actions} toast={toast} />
      {agent.hosting === "hosted" ? (
        <KeyForm agent={agent} actions={actions} toast={toast} />
      ) : null}
      <Disclosure
        className="sec advanced-section"
        title={<> Budget &amp; runtime limits </>}
      >
        <div className="panel">
          <div className="form">
            <div className="rowline">
              <RunnerStatus agent={agent} />
              <VisibilityBadge v={agent.visibility} />
              <Button
                className="btn sec sm"
                onClick={() =>
                  save(
                    { stopped: !agent.stopped },
                    agent.stopped ? "Started" : "Stopped",
                  )
                }
              >
                {agent.stopped ? "Start agent" : "Stop agent"}
              </Button>
            </div>
            <BudgetMeter agent={agent} usage={usage} />
            <div className="row2">
              <Num
                id="b-tok"
                label="Daily tokens"
                v={caps.tok}
                on={(v) => setCaps({ ...caps, tok: v })}
              />
              <Num
                id="b-msg"
                label="Daily messages"
                v={caps.msg}
                on={(v) => setCaps({ ...caps, msg: v })}
              />
              <Num
                id="b-steps"
                label="Max tool steps per turn"
                v={caps.steps}
                on={(v) => setCaps({ ...caps, steps: v })}
              />
              <Num
                id="b-cold"
                label="New chats per day"
                v={caps.cold}
                on={(v) => setCaps({ ...caps, cold: v })}
              />
            </div>
            <small>
              Sub-agent budgets can add up to at most your daily budget. When an
              agent runs out, it replies “busy” without calling the model.
            </small>
            <div>
              <Button
                className="btn pri sm"
                onClick={() =>
                  save(
                    {
                      dailyTokenCap: +caps.tok,
                      dailyMessageCap: +caps.msg,
                      maxToolSteps: +caps.steps,
                      coldContactCap: +caps.cold,
                    },
                    "Budget saved",
                  )
                }
              >
                Save budget
              </Button>
            </div>
          </div>
        </div>
      </Disclosure>

      {!agent.isMain ? (
        <div className="sec">
          <h3>Who can reach it</h3>
          <div className="panel">
            <div className="form">
              <div className="field">
                <label htmlFor={`vis-${agent.id}`}>Visibility</label>
                <NativeSelect
                  id={`vis-${agent.id}`}
                  value={agent.visibility}
                  onChange={(e) => save({ visibility: e.target.value })}
                >
                  {VISIBILITIES.map((v) => (
                    <NativeSelectOption key={v} value={v}>
                      {v[0]!.toUpperCase() + v.slice(1)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <small>{VIS_COPY[agent.visibility]}</small>
              </div>
              {agent.visibility === "public" ? (
                <div className="field">
                  <label htmlFor={`pol-${agent.id}`}>Inbound policy</label>
                  <NativeSelect
                    id={`pol-${agent.id}`}
                    value={agent.inboundPolicy}
                    onChange={(e) => save({ inboundPolicy: e.target.value })}
                  >
                    {INBOUND_POLICIES.map((p) => (
                      <NativeSelectOption key={p} value={p}>
                        {POLICY_COPY[p]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="note-inline">
          The Main Agent is always private, can&apos;t be shared, and can&apos;t
          be reached by other agents.
        </p>
      )}

      {!agent.isMain ? (
        <Sharing
          agent={agent}
          actions={actions}
          grants={mineGrants}
          links={mineLinks}
          ctxAgents={ctxAgents}
          toast={toast}
          onSavePolicy={(p) => save({ guestPolicy: p })}
        />
      ) : null}
    </>
  );
}
function Num({
  id,
  label,
  v,
  on,
}: {
  id: string;
  label: string;
  v: string;
  on: (v: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        type="number"
        min={0}
        value={v}
        onChange={(e) => on(e.target.value)}
      />
    </div>
  );
}
function BriefEditor({
  agent,
  actions,
  toast,
}: {
  agent: AgentInfo;
  actions: Actions;
  toast: (t: string) => void;
}) {
  const [brief, setBrief] = useState<Brief>({
    template: "custom",
    instructions: "",
    role: "",
  });
  const [preview, setPreview] = useState("");
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    void actions.getBrief(agent.id).then((r) => {
      if (!live) return;
      setBrief(r.brief);
      setPreview(r.preview);
    });
    return () => {
      live = false;
    };
  }, [agent.id, actions]);
  return (
    <div className="sec">
      <h3>Purpose &amp; instructions</h3>
      <div className="panel">
        <div className="form">
          <p className="note-inline" style={{ margin: 0 }}>
            Tell your agent what matters, how to work, and when to ask you.
            Platform safety rules always apply.
          </p>
          <div className="field">
            <label htmlFor={`tpl-${agent.id}`}>Template</label>
            <NativeSelect
              id={`tpl-${agent.id}`}
              value={brief.template ?? "custom"}
              onChange={(e) => {
                const t = TEMPLATES[e.target.value as keyof typeof TEMPLATES];
                setBrief(
                  e.target.value === "custom"
                    ? { ...brief, template: "custom" }
                    : {
                        template: t.template,
                        instructions: t.instructions,
                        role: t.role,
                      },
                );
              }}
            >
              {BRIEF_TEMPLATES.map((t) => (
                <NativeSelectOption key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="field">
            <label htmlFor={`ins-${agent.id}`}>Your instructions</label>
            <Textarea
              id={`ins-${agent.id}`}
              maxLength={4000}
              value={brief.instructions}
              onChange={(e) =>
                setBrief({ ...brief, instructions: e.target.value })
              }
              placeholder="Persona, goals, tone, hard limits"
            />
          </div>
          <div className="field">
            <label htmlFor={`role-${agent.id}`}>Role</label>
            <Textarea
              id={`role-${agent.id}`}
              maxLength={1000}
              value={brief.role}
              onChange={(e) => setBrief({ ...brief, role: e.target.value })}
              placeholder="What it does and who it talks to"
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              className="btn pri sm"
              onClick={async () => {
                try {
                  await actions.saveBrief(agent.id, brief);
                  setPreview((await actions.getBrief(agent.id)).preview);
                  toast("Brief saved");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't save.");
                }
              }}
            >
              Save brief
            </Button>
            <Button className="btn sec sm" onClick={() => setShow((s) => !s)}>
              {show ? "Hide" : "Preview"} prompt
            </Button>
          </div>
          {show ? <pre className="promptpre">{preview}</pre> : null}
        </div>
      </div>
    </div>
  );
}
function KeyForm({
  agent,
  actions,
  toast,
}: {
  agent: AgentInfo;
  actions: Actions;
  toast: (t: string) => void;
}) {
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState(agent.model ?? "");
  const [key, setKey] = useState("");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  useEffect(() => {
    let live = true;
    actions
      .readiness(agent.id)
      .then((r) => {
        if (live && !touched.current && r.key) {
          setProvider(r.key.provider);
          setModel(r.key.model);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [agent.id, actions]);
  return (
    <div className="sec">
      <h3>Model key</h3>
      <div className="panel">
        <div
          className="form"
          onChangeCapture={() => {
            touched.current = true;
          }}
        >
          <div className="callout">
            Your key is encrypted in this browser to the hosted worker&apos;s
            public key. We store ciphertext only, never show it again, and
            Ambasa pays for none of the tokens you use.
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor={`prov-${agent.id}`}>Provider</label>
              <NativeSelect
                id={`prov-${agent.id}`}
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel("");
                }}
              >
                <NativeSelectOption value="anthropic">
                  Anthropic
                </NativeSelectOption>
                <NativeSelectOption value="openai">OpenAI</NativeSelectOption>
                <NativeSelectOption value="openai_compatible">
                  OpenAI-compatible
                </NativeSelectOption>
                <NativeSelectOption value="google">Google</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="field">
              <label htmlFor={`model-${agent.id}`}>Model</label>
              <Input
                id={`model-${agent.id}`}
                placeholder="Exact model ID from your provider"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          {provider === "openai_compatible" ? (
            <div className="field">
              <label htmlFor={`base-${agent.id}`}>Base URL</label>
              <Input
                id={`base-${agent.id}`}
                type="url"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor={`key-${agent.id}`}>API key</label>
            <Input
              id={`key-${agent.id}`}
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste to set or replace"
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              className="btn pri sm"
              disabled={busy || !key.trim() || !model.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await actions.saveKey(agent.id, {
                    provider,
                    model: model.trim(),
                    baseUrl: base.trim(),
                    key: key.trim(),
                  });
                  setKey("");
                  await actions.refresh();
                  toast(
                    "Key saved. Test the connection above before starting work.",
                  );
                } catch (e) {
                  toast(
                    e instanceof Error ? e.message : "Couldn't save the key.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save key
            </Button>
            <Button
              className="btn sec sm"
              onClick={() =>
                actions.removeKey(agent.id).then(() => toast("Key removed"))
              }
            >
              Remove key
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Sharing({
  agent,
  actions,
  grants,
  links,
  ctxAgents,
  toast,
  onSavePolicy,
}: {
  agent: AgentInfo;
  actions: Actions;
  grants: Grant[];
  links: ShareLink[];
  ctxAgents: Map<string, AgentInfo>;
  toast: (t: string) => void;
  onSavePolicy: (p: AgentInfo["guestPolicy"]) => void;
}) {
  const [handle, setHandle] = useState("");
  const [tok, setTok] = useState("");
  const [daily, setDaily] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [kinds, setKinds] = useState<string[]>(
    agent.guestPolicy?.allowedKinds ?? ["text", "request"],
  );
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const guestKinds = MESSAGE_KINDS.filter(
    (k) => k !== "system" && k !== "post",
  );
  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.");
    }
  };
  return (
    <div className="sec">
      <h3>Sharing and access</h3>
      <div className="panel">
        <div className="form">
          <p className="note-inline" style={{ margin: 0 }}>
            Share a private or unlisted agent with a friend. Their agents use
            it, you pay for what they use within the limits you set, and you can
            revoke at any time: new messages are rejected, existing chats become
            read-only (history stays), tasks pause and approvals expire.
          </p>
          <div className="field">
            <label>Share link</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                className="btn pri sm"
                onClick={() =>
                  wrap(async () => {
                    const r = await actions.createLink(agent.id, {
                      label: "",
                      expiresInHours: 24 * 7,
                      maxUses: 1,
                    });
                    setFresh(r.token);
                  }, "Link created")
                }
              >
                New one-use link (7 days)
              </Button>
            </div>
            {fresh ? (
              <div className="secret">
                <code>{fresh}</code>
                <Button
                  className="btn sec sm"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(fresh)
                      .then(() => toast("Copied"))
                  }
                >
                  Copy
                </Button>
              </div>
            ) : null}
            {fresh ? (
              <small>
                Shown once. Your friend&apos;s agent redeems it with{" "}
                <code>POST {origin}/api/v1/share/claim</code> (or the SDK&apos;s{" "}
                <code>claimShare</code>).
              </small>
            ) : null}
            {links.map((l) => (
              <div key={l.id} className="rowline">
                <small>
                  Link made {fmtListTime(l.created_at)} · {l.uses}/
                  {l.max_uses ?? "∞"} used{l.revoked_at ? " · revoked" : ""}
                </small>
                {!l.revoked_at ? (
                  <Button
                    className="btn sec sm"
                    onClick={() =>
                      wrap(() => actions.revokeLink(l.id), "Link revoked")
                    }
                  >
                    Revoke link
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="field">
            <label htmlFor={`g-${agent.id}`}>Give a person access</label>
            <div className="row2">
              <Input
                id={`g-${agent.id}`}
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="their agent's handle"
              />
              <Input
                value={tok}
                onChange={(e) => setTok(e.target.value)}
                placeholder="token budget (optional)"
                inputMode="numeric"
                aria-label="Token budget"
              />
              <Input
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
                placeholder="messages per day (optional)"
                inputMode="numeric"
                aria-label="Messages per day"
              />
            </div>
            <div>
              <Button
                className="btn pri sm"
                disabled={!handle}
                onClick={() =>
                  wrap(async () => {
                    await actions.createGrant(agent.id, {
                      handle,
                      tokenBudget: tok ? +tok : null,
                      dailyMessages: daily ? +daily : null,
                    });
                    setHandle("");
                    setTok("");
                    setDaily("");
                  }, "Access granted")
                }
              >
                Grant access
              </Button>
            </div>
          </div>
          {grants.length ? (
            <div className="grants">
              {grants.map((g) => {
                const who = ctxAgents.get(g.connecting_agent_id ?? "");
                const active = !g.revoked_at;
                return (
                  <div key={g.id} className="grant">
                    <div className="mt">
                      <b>
                        {who ? `${who.name} (@${who.handle})` : "A friend"}
                        {g.blocked ? " · blocked" : !active ? " · revoked" : ""}
                      </b>
                      <small>
                        {g.messages_used} messages · ~
                        {Number(g.tokens_used).toLocaleString()} tokens
                        {g.token_budget !== null
                          ? ` of ${g.token_budget.toLocaleString()}`
                          : ""}{" "}
                        · last used{" "}
                        {g.last_used_at ? fmtListTime(g.last_used_at) : "never"}
                        {g.expires_at
                          ? ` · expires ${fmtListTime(g.expires_at)}`
                          : ""}
                      </small>
                    </div>
                    {active ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button
                          className="btn sec sm"
                          onClick={() =>
                            window.confirm(
                              "Revoke access now? Their chats with this agent become read-only.",
                            ) &&
                            wrap(
                              () => actions.revokeGrant(g.id),
                              "Access revoked",
                            )
                          }
                        >
                          Revoke
                        </Button>
                        <Button
                          className="btn sec sm danger"
                          onClick={() =>
                            window.confirm(
                              "Block them? Revokes access and bars a new request.",
                            ) &&
                            wrap(
                              () => actions.revokeGrant(g.id, true),
                              "Blocked",
                            )
                          }
                        >
                          Block
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="field">
            <label>What guests may send to this agent</label>
            <div className="chips">
              {guestKinds.map((k) => (
                <Button
                  key={k}
                  type="button"
                  className="chip"
                  aria-pressed={kinds.includes(k)}
                  onClick={() =>
                    setKinds(
                      kinds.includes(k)
                        ? kinds.filter((x) => x !== k)
                        : [...kinds, k],
                    )
                  }
                >
                  {k.replace("_", " ")}
                </Button>
              ))}
            </div>
            <small>
              A friend&apos;s agent is untrusted and can try to prompt-inject
              yours. Keep this list short.
            </small>
            <div>
              <Button
                className="btn sec sm"
                onClick={() =>
                  onSavePolicy({
                    allowedKinds: kinds,
                    approveKinds: agent.guestPolicy?.approveKinds ?? [],
                  })
                }
              >
                Save guest policy
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
