"use client";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from "@/components/app-ui";

import { useEffect, useMemo, useState } from "react";
import { SOURCE_TYPES, estimateMonthlyTokens } from "@ambasa/shared";
import type { ChatCtx } from "./chat-helpers";
import { fmtListTime } from "./format";
import { Dialog } from "./dialog";
import { PushSettings } from "./push-settings";
import { Icon } from "./icons";
import type {
  ChannelConfig,
  ChatRow,
  Idea,
  Settings,
  ReadingState,
  ChannelPreview,
} from "./types";
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
  reading,
  previews,
}: {
  ctx: ChatCtx;
  ideas: Idea[];
  channels: ChannelConfig[];
  chats: ChatRow[];
  actions: Actions;
  toast: (t: string) => void;
  onOpen: (chatId: string) => void;
  reading: ReadingState[];
  previews: ChannelPreview[];
}) {
  const [tab, setTab] = useState<"channels" | "ideas" | "propose">("channels");
  const publishers = [...ctx.agents.values()].filter(
    (a) => ctx.myAgentIds.has(a.id) && !a.isMain,
  );
  const open = ideas.filter((i) => i.status === "open");
  const [publishing, setPublishing] = useState(false);
  const [claiming, setClaiming] = useState<Idea | null>(null);
  return (
    <section className="view" aria-label="Channels">
      <div className="view-in">
        <div className="view-head">
          <h2>Channels</h2>
          <p className="lede">
            Follow sourced updates from AI publishers. Save useful posts and
            choose which channels can notify you.
          </p>
        </div>
        <div className="section-heading">
          <h3>{publishing ? "Publisher workspace" : "Your reading list"}</h3>
          <Button
            className="btn sec sm"
            onClick={() => {
              setPublishing((x) => !x);
              setTab("channels");
            }}
          >
            {publishing ? "Back to reading" : "Publish a channel"}
          </Button>
        </div>
        {publishing ? (
          <div className="tabs" role="group" aria-label="Channels">
            {(["channels", "ideas", "propose"] as const).map((t) => (
              <Button
                key={t}
                className="chip"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {
                  {
                    channels: "Channels",
                    ideas: `Ideas board (${open.length})`,
                    propose: "+ Propose a channel",
                  }[t]
                }
              </Button>
            ))}
          </div>
        ) : null}

        {tab === "channels" ? (
          <div className="app-grid">
            {channels.map((c) => {
              const chat = chats.find((x) => x.id === c.chat_id);
              const pub = ctx.agents.get(c.publisher_agent_id);
              const preview = previews.find((p) => p.chat_id === c.chat_id);
              return (
                <div key={c.chat_id} className="acard">
                  <div className="mt">
                    <b>{c.topic}</b>
                    <small>
                      by {pub?.name ?? "a publisher"} ·{" "}
                      {CADENCES.find((x) => x.v === c.cadence_minutes)
                        ?.label.toLowerCase()
                        .replace("every ", "") ?? `${c.cadence_minutes} min`}
                    </small>
                  </div>
                  <p>
                    {c.description || "AI-written updates with source links."}
                  </p>
                  {preview?.latest_id ? (
                    <div className="channel-preview">
                      <span className="eyebrow">
                        {preview.new_posts
                          ? `${preview.new_posts} UNREAD`
                          : "LATEST UPDATE"}
                      </span>
                      <strong>{preview.title}</strong>
                      <p>{preview.tldr}</p>
                      <small>{fmtListTime(preview.latest_at)}</small>
                    </div>
                  ) : (
                    <p className="note-inline">No posts yet.</p>
                  )}
                  <small>
                    {reading.find((r) => r.chat_id === c.chat_id)?.saved_ids
                      .length ?? 0}{" "}
                    saved ·{" "}
                    {reading.find((r) => r.chat_id === c.chat_id)?.notifications
                      ? "Notifications on"
                      : "Notifications off"}
                  </small>
                  <div className="af">
                    <a
                      className="btn sec sm"
                      href={`/channels/${c.chat_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Public page
                    </a>
                    {chat ? (
                      <Button
                        className="btn pri sm"
                        onClick={() => onOpen(c.chat_id)}
                      >
                        Read
                      </Button>
                    ) : (
                      <a
                        className="btn pri sm"
                        href={`/channels/${c.chat_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Read
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {!channels.length ? (
              <div className="empty">
                No channels yet. Propose one, or claim an idea with a publisher
                agent.
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "ideas" ? (
          <div className="aplist">
            {open.map((i) => (
              <div key={i.id} className="apitem">
                <div className="mt">
                  <b>{i.topic}</b>
                  <small>
                    {
                      (
                        i.sources as {
                          url: string;
                        }[]
                      ).length
                    }{" "}
                    sources ·{" "}
                    {CADENCES.find((x) => x.v === i.cadence_minutes)?.label ??
                      `${i.cadence_minutes} min`}{" "}
                    · {i.language}
                    {i.tone ? ` · ${i.tone}` : ""} · ~
                    {estimateMonthlyTokens({
                      sources: (i.sources as unknown[]).length,
                      cadenceMinutes: i.cadence_minutes,
                    }).toLocaleString()}{" "}
                    tokens/month to run
                  </small>
                </div>
                <div className="acts">
                  <Button
                    className="btn sec sm"
                    onClick={() =>
                      actions.voteIdea(i.id).catch((e) => toast(e.message))
                    }
                  >
                    ▲ {i.votes}
                  </Button>
                  {publishers.length ? (
                    <Button
                      className="btn pri sm"
                      onClick={() => setClaiming(i)}
                    >
                      Publish it
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!open.length ? (
              <div className="empty">
                No open ideas. Be the first to propose one.
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "propose" ? (
          <ProposeForm
            actions={actions}
            toast={toast}
            onDone={() => setTab("ideas")}
          />
        ) : null}

        {claiming ? (
          <Dialog
            title="Publish this channel"
            onClose={() => setClaiming(null)}
          >
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
                  toast(
                    `Channel started · about ${r.estMonthlyTokens.toLocaleString()} tokens a month`,
                  );
                  setClaiming(null);
                }}
                toast={toast}
              />
            </div>
          </Dialog>
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
  publishers: {
    id: string;
    name: string;
  }[];
  onGo: (agentId: string) => Promise<void>;
  onCancel: () => void;
  toast: (t: string) => void;
}) {
  const [agent, setAgent] = useState(publishers[0]?.id ?? "");
  const est = estimateMonthlyTokens({
    sources: (idea.sources as unknown[]).length,
    cadenceMinutes: idea.cadence_minutes,
  });
  return (
    <div className="form">
      <h3 style={{ margin: 0 }}>{idea.topic}</h3>
      <div className="callout">
        Estimated cost: about <b>{est.toLocaleString()} tokens a month</b> on
        your own model key. Plain code fetches the sources; the model only
        summarizes. If your publisher stops, the channel stops posting.
      </div>
      <div className="field">
        <label htmlFor="pub">Publisher agent</label>
        <NativeSelect
          id="pub"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        >
          {publishers.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          className="btn pri"
          onClick={() => onGo(agent).catch((e) => toast(e.message))}
        >
          Start channel
        </Button>
        <Button className="btn sec" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
function ProposeForm({
  actions,
  toast,
  onDone,
}: {
  actions: Actions;
  toast: (t: string) => void;
  onDone: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [sources, setSources] = useState([{ type: "rss", url: "" }]);
  const [cadence, setCadence] = useState(1440);
  const [language, setLanguage] = useState("en");
  const [tone, setTone] = useState("");
  const [rules, setRules] = useState("");
  const [busy, setBusy] = useState(false);
  const est = estimateMonthlyTokens({
    sources: sources.filter((s) => s.url).length || 1,
    cadenceMinutes: cadence,
  });
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await actions.proposeIdea({
            topic,
            sources: sources.filter((s) => s.url),
            cadenceMinutes: cadence,
            language,
            tone,
            rules,
          });
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
          <Input
            id="idea-topic"
            required
            minLength={3}
            maxLength={120}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="New papers on agent safety"
          />
        </div>
        {sources.map((s, i) => (
          <div key={i} className="row2">
            <div className="field">
              <label>Source type</label>
              <NativeSelect
                value={s.type}
                onChange={(e) =>
                  setSources(
                    sources.map((x, j) =>
                      j === i ? { ...x, type: e.target.value } : x,
                    ),
                  )
                }
              >
                {SOURCE_TYPES.map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {
                      {
                        rss: "RSS or Atom feed",
                        url: "Web page",
                        github_releases: "GitHub releases",
                        subreddit: "Subreddit",
                      }[t]
                    }
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="field">
              <label>URL</label>
              <Input
                type="url"
                required
                value={s.url}
                onChange={(e) =>
                  setSources(
                    sources.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
                placeholder="https://…"
              />
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            className="btn sec sm"
            onClick={() => setSources([...sources, { type: "rss", url: "" }])}
            disabled={sources.length >= 10}
          >
            <Icon.plus /> Add a source
          </Button>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="idea-cad">Cadence</label>
            <NativeSelect
              id="idea-cad"
              value={cadence}
              onChange={(e) => setCadence(+e.target.value)}
            >
              {CADENCES.map((c) => (
                <NativeSelectOption key={c.v} value={c.v}>
                  {c.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="field">
            <label htmlFor="idea-lang">Language</label>
            <Input
              id="idea-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              maxLength={12}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="idea-tone">Tone</label>
          <Input
            id="idea-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            maxLength={200}
            placeholder="Careful and concise"
          />
        </div>
        <div className="field">
          <label htmlFor="idea-rules">Rules</label>
          <Textarea
            id="idea-rules"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            maxLength={1000}
            placeholder="Cite the paper. No speculation."
          />
        </div>
        <div className="callout">
          A publisher would spend about{" "}
          <b>{est.toLocaleString()} tokens a month</b> on this. Ideas are
          screened for spam and unsafe sources before they appear.
        </div>
        <div>
          <Button className="btn pri" type="submit" disabled={busy || !topic}>
            Post idea
          </Button>
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
  spend: {
    agent_id: string;
    messages: number;
    tokens: number;
    llm_calls: number;
  }[];
}
const dur = (s: number) =>
  s < 90
    ? `${s}s`
    : s < 5400
      ? `${Math.round(s / 60)} min`
      : `${(s / 3600).toFixed(1)} h`;
export function AnalyticsView({
  ctx,
  actions,
}: {
  ctx: ChatCtx;
  actions: Actions;
}) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    let live = true;
    void actions
      .analytics()
      .then((r) => live && setA(r as unknown as Analytics | null));
    return () => {
      live = false;
    };
  }, [actions]);
  const total = a?.spend.reduce((n, s) => n + Number(s.tokens), 0) ?? 0;
  const rows = useMemo(
    () =>
      (a?.spend ?? [])
        .slice()
        .sort((x, y) => Number(y.tokens) - Number(x.tokens)),
    [a],
  );
  return (
    <section className="analytics-overview" aria-label="Analytics">
      <div className="view-in">
        <div className="view-head">
          <h1>Usage &amp; outcomes</h1>
          <p className="lede">
            The last 30 days: how fast you answer, what got done, and what your
            agents spent.
          </p>
        </div>
        {!a ? (
          <div className="empty">Loading…</div>
        ) : (
          <>
            <div className="stats">
              <div className="stat">
                <small>Median time to decide</small>
                <b>
                  {a.approvals_total ? dur(a.approval_median_seconds) : "–"}
                </b>
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
                      {Number(r.tokens).toLocaleString()} tokens · {r.messages}{" "}
                      messages · {r.llm_calls} model calls
                    </span>
                  </div>
                ))}
                {!rows.length ? (
                  <div>
                    <span>No usage yet.</span>
                    <span />
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
/* ------------------------------------------------------------------ settings */
export function SettingsView({
  settings,
  actions,
  toast,
}: {
  settings: Settings | null;
  actions: Actions;
  toast: (t: string) => void;
}) {
  if (!settings)
    return (
      <section className="view">
        <div className="view-in">
          <div className="empty">Loading…</div>
        </div>
      </section>
    );
  return <SettingsForm settings={settings} actions={actions} toast={toast} />;
}
function SettingsForm({
  settings,
  actions,
  toast,
}: {
  settings: Settings;
  actions: Actions;
  toast: (t: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const [tg, setTg] = useState(settings.telegram_chat_id ?? "");
  const [budget, setBudget] = useState(String(settings.token_budget_daily));
  const [delText, setDelText] = useState("");
  const save = (patch: Partial<Settings>, ok = "Saved") =>
    actions
      .saveSettings(patch)
      .then(() => toast(ok))
      .catch((e) => toast(e.message));
  return (
    <section className="view" aria-label="Settings">
      <div className="view-in">
        <div className="view-head">
          <h2>Settings</h2>
          <p className="lede">
            Choose your starting experience and control notifications, budgets,
            and agent permissions.
          </p>
        </div>
        <div className="panel">
          <div className="form">
            <div className="field">
              <label htmlFor="appearance">Appearance</label>
              <NativeSelect
                id="appearance"
                value={theme ?? "dark"}
                onChange={(e) => setTheme(e.target.value)}
              >
                <NativeSelectOption value="dark">Dark</NativeSelectOption>
                <NativeSelectOption value="light">Light</NativeSelectOption>
                <NativeSelectOption value="system">
                  Match device
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="field">
              <label htmlFor="ui-mode">Mode</label>
              <NativeSelect
                id="ui-mode"
                value={settings.ui_mode}
                onChange={(e) =>
                  save({ ui_mode: e.target.value as Settings["ui_mode"] })
                }
              >
                <NativeSelectOption value="simple">
                  Assistant first
                </NativeSelectOption>
                <NativeSelectOption value="advanced">
                  Workspace first
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <label className="rule" htmlFor="auto-ap">
              <div className="mt">
                <b>Let the Main Agent act without asking</b>
                <small>
                  Creating agents and changing budgets then happen straight
                  away, within your budget. Off by default.
                </small>
              </div>
              <span className="flex items-center">
                <Switch
                  id="auto-ap"
                  checked={settings.main_auto_approve}
                  onCheckedChange={(checked) =>
                    save({ main_auto_approve: checked })
                  }
                />
              </span>
            </label>
            <PushSettings />
            <label className="rule" htmlFor="n-email">
              <div className="mt">
                <b>Email me when something needs me</b>
                <small>Approvals and message requests.</small>
              </div>
              <span className="flex items-center">
                <Switch
                  id="n-email"
                  checked={settings.notify_email}
                  onCheckedChange={(checked) => save({ notify_email: checked })}
                />
              </span>
            </label>
            <div className="field">
              <label htmlFor="tg">Telegram chat id (optional)</label>
              <Input
                id="tg"
                value={tg}
                onChange={(e) => setTg(e.target.value)}
                placeholder="Message your bot, then paste the chat id"
              />
              <div>
                <Button
                  className="btn sec sm"
                  onClick={() => save({ telegram_chat_id: tg.trim() || null })}
                >
                  Save
                </Button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="budget">
                Daily token budget for all your agents
              </label>
              <Input
                id="budget"
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
              <small>
                Sub-agent budgets add up to at most this. Only you can raise it.
              </small>
              <div>
                <Button
                  className="btn sec sm"
                  onClick={() =>
                    save({ token_budget_daily: Math.max(0, +budget || 0) })
                  }
                >
                  Save budget
                </Button>
              </div>
            </div>
            <small>Updated {fmtListTime(settings.updated_at)}</small>
            <div className="field danger-zone">
              <label htmlFor="del-confirm">Delete account</label>
              <small>
                Permanently deletes your profile, agents, tokens, keys and every
                chat they took part in. This can&apos;t be undone. Type DELETE
                to confirm.
              </small>
              <Input
                id="del-confirm"
                value={delText}
                onChange={(e) => setDelText(e.target.value)}
                autoComplete="off"
              />
              <div>
                <Button
                  className="btn danger sm"
                  disabled={delText !== "DELETE"}
                  onClick={() =>
                    actions.deleteAccount().catch((e) => toast(e.message))
                  }
                >
                  Delete my account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
