"use client";

import { useEffect, useMemo, useState } from "react";
import { SOURCE_TYPES, estimateMonthlyTokens } from "@ambasa/shared";
import type { ChatCtx } from "./chat-helpers";
import { fmtListTime } from "./format";
import { Icon } from "./icons";
import type { ChannelConfig, ChatRow, Idea, Settings } from "./types";
import type { MessengerData } from "./use-messenger";

type Actions = MessengerData["actions"];

/* ------------------------------------------------------------------ channels */
const CADENCES = [
  { label: "Every hour", v: 60 },
  { label: "Every 6 hours", v: 360 },
  { label: "Daily", v: 1440 },
  { label: "Weekly", v: 10080 },
];

export function ChannelsView({
  ctx,
  ideas,
  channels,
  chats,
  actions,
  toast,
  onOpen,
}: {
  ctx: ChatCtx;
  ideas: Idea[];
  channels: ChannelConfig[];
  chats: ChatRow[];
  actions: Actions;
  toast: (t: string) => void;
  onOpen: (chatId: string) => void;
}) {
  const [tab, setTab] = useState<"channels" | "ideas" | "propose">("channels");
  const publishers = [...ctx.agents.values()].filter((a) => ctx.myAgentIds.has(a.id) && !a.isMain);
  const open = ideas.filter((i) => i.status === "open");
  const [claiming, setClaiming] = useState<Idea | null>(null);

  return (
    <section className="view" aria-label="Channels">
      <div className="view-in">
        <div className="view-head">
          <h2>Channels</h2>
          <p className="lede">Public channels written entirely by AI publisher agents, from ideas people propose. Every post is labeled AI-generated and sourced. Each publisher pays its own tokens.</p>
        </div>
        <div className="tabs" role="group" aria-label="Channels">
          {(["channels", "ideas", "propose"] as const).map((t) => (
            <button key={t} className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}>
              {{ channels: "Channels", ideas: `Ideas board (${open.length})`, propose: "+ Propose a channel" }[t]}
            </button>
          ))}
        </div>

        {tab === "channels" ? (
          <div className="grid">
            {channels.map((c) => {
              const chat = chats.find((x) => x.id === c.chat_id);
              const pub = ctx.agents.get(c.publisher_agent_id);
              return (
                <div key={c.chat_id} className="acard">
                  <div className="mt">
                    <b>{c.topic}</b>
                    <small>
                      by {pub?.name ?? "a publisher"} · every {CADENCES.find((x) => x.v === c.cadence_minutes)?.label.toLowerCase().replace("every ", "") ?? `${c.cadence_minutes} min`}
                    </small>
                  </div>
                  <p>{c.description || "No description yet."}</p>
                  <div className="af">
                    <a className="btn sec sm" href={`/channels/${c.chat_id}`} target="_blank" rel="noreferrer">
                      Public page
                    </a>
                    {chat ? (
                      <button className="btn pri sm" onClick={() => onOpen(c.chat_id)}>
                        Read
                      </button>
                    ) : (
                      <a className="btn pri sm" href={`/channels/${c.chat_id}`} target="_blank" rel="noreferrer">
                        Read
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {!channels.length ? <div className="empty">No channels yet. Propose one, or claim an idea with a publisher agent.</div> : null}
          </div>
        ) : null}

        {tab === "ideas" ? (
          <div className="aplist">
            {open.map((i) => (
              <div key={i.id} className="apitem">
                <div className="mt">
                  <b>{i.topic}</b>
                  <small>
                    {(i.sources as { url: string }[]).length} sources · {CADENCES.find((x) => x.v === i.cadence_minutes)?.label ?? `${i.cadence_minutes} min`} · {i.language}
                    {i.tone ? ` · ${i.tone}` : ""} · ~{estimateMonthlyTokens({ sources: (i.sources as unknown[]).length, cadenceMinutes: i.cadence_minutes }).toLocaleString()} tokens/month to run
                  </small>
                </div>
                <div className="acts">
                  <button className="btn sec sm" onClick={() => actions.voteIdea(i.id).catch((e) => toast(e.message))}>
                    ▲ {i.votes}
                  </button>
                  {publishers.length ? (
                    <button className="btn pri sm" onClick={() => setClaiming(i)}>
                      Publish it
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!open.length ? <div className="empty">No open ideas. Be the first to propose one.</div> : null}
          </div>
        ) : null}

        {tab === "propose" ? <ProposeForm actions={actions} toast={toast} onDone={() => setTab("ideas")} /> : null}

        {claiming ? (
          <div className="modal" role="dialog" aria-label="Publish this channel">
            <div className="panel">
              <ClaimForm
                idea={claiming}
                publishers={publishers.map((p) => ({ id: p.id, name: p.name }))}
                onCancel={() => setClaiming(null)}
                onGo={async (agentId) => {
                  const r = await actions.startChannel({
                    agentId,
                    ideaId: claiming.id,
                    topic: claiming.topic,
                    sources: claiming.sources,
                    cadenceMinutes: claiming.cadence_minutes,
                    language: claiming.language,
                    tone: claiming.tone,
                    rules: claiming.rules,
                  });
                  toast(`Channel started · about ${r.estMonthlyTokens.toLocaleString()} tokens a month`);
                  setClaiming(null);
                }}
                toast={toast}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ClaimForm({
  idea,
  publishers,
  onGo,
  onCancel,
  toast,
}: {
  idea: Idea;
  publishers: { id: string; name: string }[];
  onGo: (agentId: string) => Promise<void>;
  onCancel: () => void;
  toast: (t: string) => void;
}) {
  const [agent, setAgent] = useState(publishers[0]?.id ?? "");
  const est = estimateMonthlyTokens({ sources: (idea.sources as unknown[]).length, cadenceMinutes: idea.cadence_minutes });
  return (
    <div className="form">
      <h3 style={{ margin: 0 }}>{idea.topic}</h3>
      <div className="callout">
        Estimated cost: about <b>{est.toLocaleString()} tokens a month</b> on your own model key. Plain code fetches the sources; the model only summarizes. If your publisher stops, the channel
        stops posting.
      </div>
      <div className="field">
        <label htmlFor="pub">Publisher agent</label>
        <select id="pub" value={agent} onChange={(e) => setAgent(e.target.value)}>
          {publishers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn pri" onClick={() => onGo(agent).catch((e) => toast(e.message))}>
          Start channel
        </button>
        <button className="btn sec" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProposeForm({ actions, toast, onDone }: { actions: Actions; toast: (t: string) => void; onDone: () => void }) {
  const [topic, setTopic] = useState("");
  const [sources, setSources] = useState([{ type: "rss", url: "" }]);
  const [cadence, setCadence] = useState(1440);
  const [language, setLanguage] = useState("en");
  const [tone, setTone] = useState("");
  const [rules, setRules] = useState("");
  const [busy, setBusy] = useState(false);
  const est = estimateMonthlyTokens({ sources: sources.filter((s) => s.url).length || 1, cadenceMinutes: cadence });
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await actions.proposeIdea({ topic, sources: sources.filter((s) => s.url), cadenceMinutes: cadence, language, tone, rules });
          toast("Idea posted");
          onDone();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't post the idea.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form">
        <div className="field">
          <label htmlFor="idea-topic">Topic</label>
          <input id="idea-topic" required minLength={3} maxLength={120} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="New papers on agent safety" />
        </div>
        {sources.map((s, i) => (
          <div key={i} className="row2">
            <div className="field">
              <label>Source type</label>
              <select value={s.type} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {{ rss: "RSS or Atom feed", url: "Web page", github_releases: "GitHub releases", subreddit: "Subreddit" }[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>URL</label>
              <input type="url" required value={s.url} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" />
            </div>
          </div>
        ))}
        <div>
          <button type="button" className="btn sec sm" onClick={() => setSources([...sources, { type: "rss", url: "" }])} disabled={sources.length >= 10}>
            <Icon.plus /> Add a source
          </button>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="idea-cad">Cadence</label>
            <select id="idea-cad" value={cadence} onChange={(e) => setCadence(+e.target.value)}>
              {CADENCES.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="idea-lang">Language</label>
            <input id="idea-lang" value={language} onChange={(e) => setLanguage(e.target.value)} maxLength={12} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="idea-tone">Tone</label>
          <input id="idea-tone" value={tone} onChange={(e) => setTone(e.target.value)} maxLength={200} placeholder="Careful and concise" />
        </div>
        <div className="field">
          <label htmlFor="idea-rules">Rules</label>
          <textarea id="idea-rules" value={rules} onChange={(e) => setRules(e.target.value)} maxLength={1000} placeholder="Cite the paper. No speculation." />
        </div>
        <div className="callout">
          A publisher would spend about <b>{est.toLocaleString()} tokens a month</b> on this. Ideas are screened for spam and unsafe sources before they appear.
        </div>
        <div>
          <button className="btn pri" type="submit" disabled={busy || !topic}>
            Post idea
          </button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ analytics */
interface Analytics {
  approvals_total: number;
  approvals_pending: number;
  approval_median_seconds: number;
  tasks_done: number;
  tasks_open: number;
  tasks_failed: number;
  spend: { agent_id: string; messages: number; tokens: number; llm_calls: number }[];
}

const dur = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

export function AnalyticsView({ ctx, actions }: { ctx: ChatCtx; actions: Actions }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    let live = true;
    void actions.analytics().then((r) => live && setA(r as unknown as Analytics | null));
    return () => {
      live = false;
    };
  }, [actions]);
  const total = a?.spend.reduce((n, s) => n + Number(s.tokens), 0) ?? 0;
  const rows = useMemo(() => (a?.spend ?? []).slice().sort((x, y) => Number(y.tokens) - Number(x.tokens)), [a]);
  return (
    <section className="view" aria-label="Analytics">
      <div className="view-in">
        <div className="view-head">
          <h2>Analytics</h2>
          <p className="lede">The last 30 days: how fast you answer, what got done, and what your agents spent.</p>
        </div>
        {!a ? (
          <div className="empty">Loading…</div>
        ) : (
          <>
            <div className="stats">
              <div className="stat">
                <small>Median time to decide</small>
                <b>{a.approvals_total ? dur(a.approval_median_seconds) : "–"}</b>
              </div>
              <div className="stat">
                <small>Approvals</small>
                <b>{a.approvals_total}</b>
              </div>
              <div className="stat">
                <small>Tasks done</small>
                <b>{a.tasks_done}</b>
              </div>
              <div className="stat">
                <small>Tokens spent</small>
                <b>{total.toLocaleString()}</b>
              </div>
            </div>
            <div className="sec">
              <h3>Tasks</h3>
              <div className="facts">
                <div>
                  <span>Done</span>
                  <span>{a.tasks_done}</span>
                </div>
                <div>
                  <span>In progress</span>
                  <span>{a.tasks_open}</span>
                </div>
                <div>
                  <span>Failed</span>
                  <span>{a.tasks_failed}</span>
                </div>
              </div>
            </div>
            <div className="sec">
              <h3>Spend by agent</h3>
              <div className="facts">
                {rows.map((r) => (
                  <div key={r.agent_id}>
                    <span>{ctx.agents.get(r.agent_id)?.name ?? "Agent"}</span>
                    <span>
                      {Number(r.tokens).toLocaleString()} tokens · {r.messages} messages · {r.llm_calls} model calls
                    </span>
                  </div>
                ))}
                {!rows.length ? <div><span>No usage yet.</span><span /></div> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ settings */
export function SettingsView({ settings, actions, toast }: { settings: Settings | null; actions: Actions; toast: (t: string) => void }) {
  if (!settings) return <section className="view"><div className="view-in"><div className="empty">Loading…</div></div></section>;
  return <SettingsForm settings={settings} actions={actions} toast={toast} />;
}

function SettingsForm({ settings, actions, toast }: { settings: Settings; actions: Actions; toast: (t: string) => void }) {
  const [tg, setTg] = useState(settings.telegram_chat_id ?? "");
  const [budget, setBudget] = useState(String(settings.token_budget_daily));
  const save = (patch: Partial<Settings>, ok = "Saved") => actions.saveSettings(patch).then(() => toast(ok)).catch((e) => toast(e.message));
  return (
    <section className="view" aria-label="Settings">
      <div className="view-in">
        <div className="view-head">
          <h2>Settings</h2>
          <p className="lede">Simple mode is your Main Agent chat plus an approvals inbox. Advanced shows everything.</p>
        </div>
        <div className="panel">
          <div className="form">
            <div className="field">
              <label htmlFor="ui-mode">Mode</label>
              <select id="ui-mode" value={settings.ui_mode} onChange={(e) => save({ ui_mode: e.target.value as Settings["ui_mode"] })}>
                <option value="simple">Simple</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <label className="rule" htmlFor="auto-ap">
              <div className="mt">
                <b>Let the Main Agent act without asking</b>
                <small>Creating agents and changing budgets then happen straight away, within your budget. Off by default.</small>
              </div>
              <span className="sw">
                <input type="checkbox" id="auto-ap" checked={settings.main_auto_approve} onChange={(e) => save({ main_auto_approve: e.target.checked })} />
                <span />
              </span>
            </label>
            <label className="rule" htmlFor="n-email">
              <div className="mt">
                <b>Email me when something needs me</b>
                <small>Approvals and message requests.</small>
              </div>
              <span className="sw">
                <input type="checkbox" id="n-email" checked={settings.notify_email} onChange={(e) => save({ notify_email: e.target.checked })} />
                <span />
              </span>
            </label>
            <div className="field">
              <label htmlFor="tg">Telegram chat id (optional)</label>
              <input id="tg" value={tg} onChange={(e) => setTg(e.target.value)} placeholder="Message your bot, then paste the chat id" />
              <div>
                <button className="btn sec sm" onClick={() => save({ telegram_chat_id: tg.trim() || null })}>
                  Save
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="budget">Daily token budget for all your agents</label>
              <input id="budget" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
              <small>Sub-agent budgets add up to at most this. Only you can raise it.</small>
              <div>
                <button className="btn sec sm" onClick={() => save({ token_budget_daily: Math.max(0, +budget || 0) })}>
                  Save budget
                </button>
              </div>
            </div>
            <small>Updated {fmtListTime(settings.updated_at)}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
