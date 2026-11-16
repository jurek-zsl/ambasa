"use client";
import {
  Trace,
  TraceLine,
  TraceTitle,
  TraceIcon,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "@/components/ui/trace";
import { Button } from "@/components/app-ui";

import { useState } from "react";
import { fromRow } from "@ambasa/shared";
import { myMembers, type ChatCtx } from "./chat-helpers";
import type { Approval, ChatRow, Msg } from "./types";
import { Icon } from "./icons";
import { approvalDetails } from "./approval-details";
import { Dialog } from "./dialog";
export function TaskSummary({
  ctx,
  chat,
  messages = [],
  approvals,
  onOpen,
  onGuide,
  onSetup,
}: {
  ctx: ChatCtx;
  chat: ChatRow;
  messages: Msg[] | undefined;
  approvals: Approval[];
  onOpen: (id: string) => void;
  onGuide: (text: string) => Promise<unknown>;
  onSetup: (id?: string) => void;
}) {
  const [compare, setCompare] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mine = myMembers(ctx, chat.id);
  const agent = ctx.agents.get(mine[0]?.agent_id ?? "");
  const pending = approvals.filter(
    (a) =>
      a.chat_id === chat.id &&
      a.owner_id === ctx.userId &&
      a.state === "pending",
  );
  const rows = messages
    .filter((m) => !m.flagged && !m.removed_at)
    .map((m) => ({ m, msg: fromRow(m.kind, m.text, m.body) }));
  const offers = rows.filter(
    (x) => x.msg.kind === "offer" || x.msg.kind === "counter_offer",
  );
  const result = rows.filter((x) => x.msg.kind === "result").at(-1);
  const paused = mine.some((m) => m.paused) || agent?.stopped;
  const blocked =
    chat.frozen ||
    chat.status === "failed" ||
    chat.status === "paused" ||
    paused;
  const label = chat.frozen
    ? "Read-only"
    : pending.length
      ? "Waiting for your approval"
      : chat.request_state === "pending"
        ? "Message request pending"
        : chat.status === "done"
          ? "Task completed"
          : blocked
            ? "Needs attention"
            : "In progress";
  const origin =
    chat.origin &&
    typeof chat.origin === "object" &&
    !Array.isArray(chat.origin)
      ? (chat.origin as Record<string, unknown>)
      : {};
  const latest = rows
    .filter(
      (x) =>
        x.m.sender_agent_id &&
        ctx.myAgentIds.has(x.m.sender_agent_id) &&
        x.msg.kind === "text",
    )
    .at(-1);
  const detail = pending[0]
    ? approvalDetails(pending[0], ctx.agents).title
    : result && "title" in result.msg
      ? result.msg.title
      : blocked
        ? "Review the last update before continuing."
        : latest?.msg.kind === "text"
          ? latest.msg.text
          : (chat.goal ?? "Your agents are working toward the goal.");
  return (
    <div className="task-summary">
      <div className="summary-heading">
        <span
          className={`summary-status ${pending.length ? "waiting" : blocked ? "blocked" : ""}`}
          role="status"
        >
          <span className="live-dot" />
          {label}
        </span>
        <span>{agent?.name ?? "Agent task"}</span>
      </div>
      <p className="summary-goal">{chat.goal ?? "Agent conversation"}</p>
      <p className="summary-detail">{detail}</p>
      <div className="summary-actions">
        {offers.length ? (
          <Button className="btn sec sm" onClick={() => setCompare(true)}>
            Compare {offers.length} offers
          </Button>
        ) : null}
        {typeof origin.chatId === "string" ? (
          <Button
            className="btn text sm"
            onClick={() => onOpen(origin.chatId as string)}
          >
            Original request <Icon.open />
          </Button>
        ) : null}
        {blocked && agent && !chat.frozen ? (
          <Button className="btn sec sm" onClick={() => onSetup(agent.id)}>
            Check agent setup
          </Button>
        ) : null}
      </div>
      <Trace className="mt-3">
        <TraceCollapsible>
          <TraceCollapsibleTrigger>
            <TraceLine
              status={
                blocked ? "error" : pending.length ? "pending" : undefined
              }
            >
              <TraceIcon>
                <Icon.task />
              </TraceIcon>
              <TraceTitle>Progress &amp; result</TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <ol>
              <li>Goal assigned</li>
              <li>
                {offers.length
                  ? `${offers.length} structured offers received`
                  : "No structured offers yet"}
              </li>
              <li>
                {pending.length
                  ? `${pending.length} decision${pending.length === 1 ? "" : "s"} waiting`
                  : approvals.some(
                        (a) => a.chat_id === chat.id && a.state === "approved",
                      )
                    ? "Owner approval recorded"
                    : "No owner approval recorded"}
              </li>
              <li>
                {result && result.msg.kind === "result" ? (
                  <>
                    Agent-reported result: <strong>{result.msg.title}</strong>
                    {result.msg.items?.length ? (
                      <ul>
                        {result.msg.items.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  "Execution has not been confirmed by a result message."
                )}
              </li>
            </ol>
            <small>
              Results are reported by agents. Check references and confirmation
              details in the conversation.
            </small>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
      {compare ? (
        <Dialog title="Compare offers" onClose={() => setCompare(false)}>
          <div className="form">
            <h2>Compare offers</h2>
            <p>
              Your choice is sent privately to {agent?.name ?? "your agent"}.
              Existing approval rules still apply.
            </p>
            <div className="offer-comparison">
              {offers.map(({ m, msg }) =>
                msg.kind === "offer" || msg.kind === "counter_offer" ? (
                  <article key={m.id}>
                    <p className="eyebrow">
                      {ctx.agents.get(m.sender_agent_id ?? "")?.name ?? "Agent"}
                    </p>
                    <h3>{msg.title}</h3>
                    {msg.price ? <strong>{msg.price}</strong> : null}
                    {msg.note ? <p>{msg.note}</p> : null}
                    <dl className="facts">
                      {Object.entries(msg.fields ?? {}).map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {!chat.frozen && agent ? (
                      <Button
                        className="btn pri"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await onGuide(
                              `I prefer offer #${m.id} from ${ctx.agents.get(m.sender_agent_id ?? "")?.handle ?? "this agent"}: ${msg.title}. Check it still meets my constraints. Ask before any payment, disclosure, or commitment.`,
                            );
                            setCompare(false);
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Could not send preference.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Ask my agent to choose this
                      </Button>
                    ) : null}
                  </article>
                ) : null,
              )}
            </div>
            {error ? <p role="alert">{error}</p> : null}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
