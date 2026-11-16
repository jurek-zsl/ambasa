"use client";
import { Button } from "@/components/app-ui";

import { useEffect, useState } from "react";
import type { AgentInfo, Readiness } from "./types";
import type { MessengerData } from "./use-messenger";
import { Icon } from "./icons";
export function ReadinessPanel({
  agent,
  actions,
  onSetup,
  onChat,
  compact = false,
}: {
  agent: AgentInfo;
  actions: MessengerData["actions"];
  onSetup?: () => void;
  onChat?: () => void;
  compact?: boolean;
}) {
  const [now, setNow] = useState(0);
  const [state, setState] = useState<Readiness | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      actions
        .readiness(agent.id)
        .then((s) => {
          if (live) {
            setState(s);
            setNow(Date.now());
            setError("");
          }
        })
        .catch(() => {
          if (live) setError("Connection status unavailable.");
        });
    void load();
    const t = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [agent.id, actions]);
  if (!state)
    return error ? (
      <div className="readiness-banner" role="status">
        {error}
        <Button className="btn sec sm" onClick={onSetup}>
          Open setup
        </Button>
      </div>
    ) : null;
  const missing = agent.hosting === "hosted" && !state.key;
  const staleCheck =
    state.check?.status === "pending" &&
    now - Date.parse(state.check.checked_at) > 60000;
  const ready =
    !state.stopped &&
    !state.budgetExhausted &&
    state.online &&
    (agent.hosting !== "hosted" ||
      (!missing && state.check?.status === "succeeded"));
  const label = state.stopped
    ? "Agent stopped"
    : state.budgetExhausted
      ? "Daily limit reached"
      : missing
        ? "Add a model key"
        : !state.online
          ? agent.hosting === "hosted"
            ? "Hosted worker offline"
            : "Waiting for your agent"
          : state.check?.status === "failed"
            ? "Connection needs attention"
            : ready
              ? "Ready to work"
              : agent.hosting === "hosted"
                ? "Test your model connection"
                : "Agent connected";
  const detail = state.stopped
    ? "Start the agent to continue."
    : state.budgetExhausted
      ? "Wait for the daily reset or review your budget."
      : missing
        ? "Finish setup to let your agent respond."
        : !state.online
          ? "Reconnect the worker or your own agent. Your history stays here."
          : staleCheck
            ? "The test is still waiting for a worker. Check that hosted mode is running."
            : (state.check?.detail ??
              "A hosting label alone does not confirm a working model connection.");
  if (compact && ready && !state.failed) return null;
  return (
    <div className={`readiness-banner ${ready ? "ready" : ""}`} role="status">
      <div>
        <strong>
          <span className={`live-dot ${ready ? "on" : ""}`} />
          {label}
        </strong>
        <p>{state.failed?.detail ?? detail}</p>
        {!compact ? (
          <small>
            {state.key
              ? `${state.key.provider} · ${state.key.model} · key ending ${state.key.hint}`
              : agent.hosting === "hosted"
                ? "No model key stored"
                : `${agent.hosting === "runner" ? "Self-hosted runner" : "External agent"} · last seen ${agent.runnerSeenAt ? new Date(agent.runnerSeenAt).toLocaleString() : "never"}`}
          </small>
        ) : null}
      </div>
      <div className="acts">
        {onSetup ? (
          <Button className="btn sec sm" onClick={onSetup}>
            {missing ? "Add key" : "Open setup"}
          </Button>
        ) : null}
        {agent.hosting === "hosted" && state.key && !state.stopped ? (
          <Button
            className="btn sec sm"
            disabled={
              busy || (state.check?.status === "pending" && !staleCheck)
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await actions.testConnection(agent.id);
                setState(await actions.readiness(agent.id));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Test failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon.play />
            {state.check?.status === "pending" && !staleCheck
              ? "Testing…"
              : "Test connection"}
          </Button>
        ) : null}
        {state.stopped ? (
          <Button
            className="btn pri sm"
            onClick={async () => {
              try {
                await actions.updateAgent(agent.id, { stopped: false });
                setState(await actions.readiness(agent.id));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not start.");
              }
            }}
          >
            Start agent
          </Button>
        ) : null}
        {onChat && state.failed ? (
          <Button className="btn sec sm" onClick={onChat}>
            Review unfinished work
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
