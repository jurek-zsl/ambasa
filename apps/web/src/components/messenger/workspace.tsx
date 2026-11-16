"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from "@/components/app-ui";

import { useState } from "react";
import { chatTitle, previewOf, myMembers, type ChatCtx } from "./chat-helpers";
import { Icon } from "./icons";
import { Dialog } from "./dialog";
import type { Approval, ChatRow, Preset, Workspace } from "./types";
import type { MessengerData } from "./use-messenger";
import { fmtListTime } from "./format";
type Actions = MessengerData["actions"];
const STARTERS = [
  {
    title: "Find the best option",
    text: "Compare three options for [what you need]. Use my constraints: [budget, timing, must-haves]. Bring me a sourced recommendation and ask before spending money.",
  },
  {
    title: "Research a topic",
    text: "Research [topic]. Find three reliable sources, compare what they say, and deliver a concise summary with links. Do not contact anyone or pay for access without asking.",
  },
  {
    title: "Arrange a booking",
    text: "Find a booking for [people] on [date] around [time], within [budget]. Compare availability and cancellation terms. Ask me before making a commitment.",
  },
];
export function TasksView({
  ctx,
  chats,
  approvals,
  workspace,
  onOpen,
  onAssistant,
  onSetup,
  actions,
  toast,
}: {
  ctx: ChatCtx;
  chats: ChatRow[];
  approvals: Approval[];
  workspace: Workspace;
  onOpen: (id: string) => void;
  onAssistant: () => void;
  onSetup: () => void;
  actions: Actions;
  toast: (s: string) => void;
}) {
  const [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState<Preset | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tasks = chats.filter((c) => c.kind === "agent" && c.type !== "channel");
  const needs = (c: ChatRow) =>
    approvals.some(
      (a) =>
        a.chat_id === c.id &&
        a.owner_id === ctx.userId &&
        a.state === "pending",
    ) ||
    (c.request_state === "pending" &&
      !!c.request_to &&
      ctx.myAgentIds.has(c.request_to));
  const blocked = (c: ChatRow) =>
    c.frozen ||
    c.status === "failed" ||
    c.status === "paused" ||
    myMembers(ctx, c.id).some(
      (m) => m.paused || ctx.agents.get(m.agent_id)?.stopped,
    );
  const shown = tasks.filter((c) =>
    filter === "all" || filter === "needs"
      ? filter === "all" || needs(c)
      : filter === "done"
        ? c.status === "done"
        : filter === "blocked"
          ? blocked(c)
          : c.status !== "done" && !c.frozen,
  );
  async function run(p: Preset) {
    setBusy(p.id);
    try {
      onOpen((await actions.runPreset(p.id)).chatId);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start task.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="view" aria-label="Tasks">
      <div className="view-in workspace-view">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>What’s happening</h1>
            <p className="lede">
              Give your agents a goal. Stay close to the decisions.
            </p>
          </div>
          <Button className="btn pri" onClick={onAssistant}>
            <Icon.plus /> New task
          </Button>
        </header>
        <div className="task-stats">
          <Button onClick={() => setFilter("needs")}>
            <span>Needs you</span>
            <strong>{tasks.filter(needs).length}</strong>
          </Button>
          <Button onClick={() => setFilter("active")}>
            <span>In progress</span>
            <strong>
              {
                tasks.filter(
                  (c) => !needs(c) && !blocked(c) && c.status !== "done",
                ).length
              }
            </strong>
          </Button>
          <Button onClick={() => setFilter("blocked")}>
            <span>Blocked</span>
            <strong>{tasks.filter(blocked).length}</strong>
          </Button>
          <Button onClick={() => setFilter("done")}>
            <span>Completed</span>
            <strong>{tasks.filter((c) => c.status === "done").length}</strong>
          </Button>
        </div>
        <div className="section-heading">
          <h2>Tasks</h2>
          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(String(value))}
          >
            <TabsList
              className="h-10 max-w-full overflow-x-auto"
              aria-label="Task status"
            >
              {[
                ["active", "Active"],
                ["needs", "Needs you"],
                ["blocked", "Blocked"],
                ["done", "Completed"],
                ["all", "All"],
              ].map(([id, label]) => (
                <TabsTrigger key={id} value={id} className="px-3">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="task-list">
          {shown.map((c) => {
            const own = myMembers(ctx, c.id)
              .map((m) => ctx.agents.get(m.agent_id)?.name)
              .filter(Boolean)
              .join(", ");
            return (
              <Button
                key={c.id}
                className="task-row"
                onClick={() => onOpen(c.id)}
              >
                <span
                  className={`task-state-dot ${needs(c) ? "waiting" : blocked(c) ? "blocked" : c.status === "done" ? "done" : ""}`}
                />
                <span className="task-row-body">
                  <strong>{chatTitle(ctx, c)}</strong>
                  <span>{c.goal || previewOf(ctx, c).text}</span>
                  <small>
                    {own || "Agent conversation"} ·{" "}
                    {needs(c)
                      ? "Waiting for your decision"
                      : blocked(c)
                        ? "Needs attention"
                        : c.status === "done"
                          ? "Completed"
                          : "Working on your goal"}
                  </small>
                </span>
                <time>{fmtListTime(c.last_message_at)}</time>
                <Icon.open />
              </Button>
            );
          })}
          {!shown.length ? (
            <div className="empty-state">
              <Icon.task />
              <h3>
                {filter === "needs"
                  ? "You’re all caught up"
                  : filter === "done"
                    ? "Your results will live here"
                    : "Nothing here yet"}
              </h3>
              <p>
                Ask your assistant to research, compare options, or arrange
                something for you.
              </p>
              <Button className="btn sec" onClick={onAssistant}>
                Ask your assistant
              </Button>
            </div>
          ) : null}
        </div>
        <div className="section-heading">
          <div>
            <h2>Ready to run</h2>
            <p>Reusable instructions, with optional schedules.</p>
          </div>
          <Button className="btn sec" onClick={() => setEditing("new")}>
            <Icon.plus /> Save a task
          </Button>
        </div>
        <div className="preset-grid">
          {workspace.presets.map((p) => (
            <article className="preset-card" key={p.id}>
              <div>
                <span className="eyebrow">
                  {p.enabled ? "RECURRING" : "PRESET"}
                </span>
                <h3>{p.title}</h3>
                <p>{p.instructions}</p>
                <small>
                  {ctx.agents.get(p.agent_id)?.name}
                  {p.enabled && p.next_run_at
                    ? ` · Next ${new Date(p.next_run_at).toLocaleString()}`
                    : ""}
                </small>
              </div>
              <div className="acts">
                <Button className="btn sec sm" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button
                  className="btn pri sm"
                  disabled={busy === p.id}
                  onClick={() => run(p)}
                >
                  {busy === p.id ? "Starting…" : "Run now"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        {!workspace.presets.length ? (
          <div className="starter-grid">
            {STARTERS.map((p) => (
              <Button
                key={p.title}
                className="starter"
                onClick={() =>
                  setEditing({
                    id: "",
                    title: p.title,
                    instructions: p.text,
                  } as Preset)
                }
              >
                <Icon.task />
                <strong>{p.title}</strong>
                <span>Customize a task preset</span>
              </Button>
            ))}
          </div>
        ) : null}
        {editing ? (
          <PresetEditor
            preset={editing === "new" ? null : editing}
            ctx={ctx}
            actions={actions}
            toast={toast}
            onSetup={onSetup}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </div>
    </section>
  );
}
function PresetEditor({
  preset,
  ctx,
  actions,
  toast,
  onClose,
  onSetup,
}: {
  preset: Preset | null;
  ctx: ChatCtx;
  actions: Actions;
  toast: (s: string) => void;
  onClose: () => void;
  onSetup: () => void;
}) {
  const agents = [...ctx.agents.values()].filter((a) =>
    ctx.myAgentIds.has(a.id),
  );
  const [title, setTitle] = useState(preset?.title ?? "");
  const [instructions, setInstructions] = useState(preset?.instructions ?? "");
  const [agentId, setAgent] = useState(
    preset?.agent_id ?? agents.find((a) => a.isMain)?.id ?? agents[0]?.id ?? "",
  );
  const supportsSchedule = ctx.agents.get(agentId)?.hosting !== "external";
  const [cadence, setCadence] = useState(String(preset?.interval_minutes ?? 0));
  const [enabled, setEnabled] = useState(preset?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog title="Save a task" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await actions.savePreset({
              ...(preset?.id ? { id: preset.id } : {}),
              agentId,
              title,
              instructions,
              intervalMinutes: Number(cadence) || null,
              enabled: !!Number(cadence) && enabled && supportsSchedule,
            });
            toast("Task saved");
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{preset?.id ? "Edit task" : "Save a task"}</h2>
        <div className="field">
          <label htmlFor="preset-title">Name</label>
          <Input
            id="preset-title"
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="preset-agent">Your agent</label>
          <NativeSelect
            id="preset-agent"
            value={agentId}
            onChange={(e) => setAgent(e.target.value)}
          >
            {agents.map((a) => (
              <NativeSelectOption key={a.id} value={a.id}>
                {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="field">
          <label htmlFor="preset-instructions">Goal and constraints</label>
          <Textarea
            id="preset-instructions"
            required
            maxLength={6000}
            rows={5}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="preset-cadence">Repeat</label>
          <NativeSelect
            id="preset-cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
          >
            <NativeSelectOption value="0">
              Only when I run it
            </NativeSelectOption>
            <NativeSelectOption value="60">Every hour</NativeSelectOption>
            <NativeSelectOption value="1440">Every 24 hours</NativeSelectOption>
            <NativeSelectOption value="10080">Every 7 days</NativeSelectOption>
          </NativeSelect>
        </div>
        {cadence !== "0" ? (
          <label className="schedule-consent">
            <Checkbox
              checked={enabled && supportsSchedule}
              disabled={!supportsSchedule}
              onCheckedChange={(checked) => setEnabled(checked)}
            />{" "}
            Enable automatic runs on my agent’s model and budget
          </label>
        ) : null}
        {!supportsSchedule && cadence !== "0" ? (
          <p className="note-inline">
            Automatic runs require hosted mode or an Ambasa runner. This preset
            can still be saved and run manually.
          </p>
        ) : null}
        <p className="note-inline">
          Instructions go to your agent privately. Existing budgets and approval
          rules still apply. Scheduled runs wait when the key is missing or the
          runner is offline; missed runs are combined.
        </p>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        <div className="acts">
          {!agents.length ? (
            <Button type="button" className="btn pri" onClick={onSetup}>
              Set up an agent
            </Button>
          ) : (
            <Button className="btn pri" disabled={busy}>
              Save task
            </Button>
          )}
          {preset?.id ? (
            <Button
              type="button"
              className="btn sec danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await actions.removePreset(preset.id);
                  onClose();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not remove.",
                  );
                  setBusy(false);
                }
              }}
            >
              Remove preset
            </Button>
          ) : null}
          <Button type="button" className="btn sec" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
