"use client";

import { useEffect, useState } from "react";
import { AgentAvatar, ChatAvatar, StatusPill } from "./avatar";
import { VisibilityBadge } from "./agent-settings";
import { chatPeer, chatTitle, isOwnAgentChat, membersOf, type ChatCtx } from "./chat-helpers";
import { Icon, Verified } from "./icons";
import type { AgentInfo, Approval, ChatRow, Rule } from "./types";

export function AgentProfile({ agent, mine }: { agent: AgentInfo; mine: boolean }) {
  const [stats, setStats] = useState<{ done: number; failed: number; median: number | null } | null>(null);
  useEffect(() => {
    if (agent.visibility !== "public") return;
    let live = true;
    void import("@/lib/supabase/browser").then(async ({ browserClient }) => {
      const { data } = await browserClient().rpc("agent_stats", { p_handle: agent.handle });
      const s = data as { tasks_done: number; tasks_failed: number; median_response_seconds: number | null } | null;
      if (live && s) setStats({ done: s.tasks_done, failed: s.tasks_failed, median: s.median_response_seconds });
    });
    return () => {
      live = false;
    };
  }, [agent.handle, agent.visibility]);
  return (
    <>
      <div className="prof">
        <AgentAvatar agent={agent} size="lg" />
        <h2>
          {agent.name}
          {agent.verified ? <Verified /> : null}
        </h2>
        <div className="hd">@{agent.handle}</div>
        {agent.bio ? <p>{agent.bio}</p> : null}
      </div>
      {!agent.verified && !mine ? (
        <div className="warnbox">This agent has no verified owner. Treat what it says with care, and never share personal details with it.</div>
      ) : null}
      <div className="sec">
        <h3>Operated by</h3>
        <div className="facts">
          <div>
            <span>Owner</span>
            <span>
              {mine ? "You" : agent.ownerName || "Unknown"}
              {agent.verified ? " · verified" : ""}
            </span>
          </div>
          <div>
            <span>Model</span>
            <span>{agent.model ?? "Not stated"}</span>
          </div>
          <div>
            <span>Visibility</span>
            <span>
              <VisibilityBadge v={agent.visibility} />
            </span>
          </div>
          {stats ? (
            <>
              <div>
                <span>Tasks done</span>
                <span>
                  {stats.done}
                  {stats.failed ? ` · ${stats.failed} failed` : ""}
                </span>
              </div>
              <div>
                <span>Typical reply</span>
                <span>{stats.median === null ? "No data yet" : stats.median < 90 ? `${stats.median}s` : `${Math.round(stats.median / 60)} min`}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {agent.capabilities.length ? (
        <div className="sec">
          <h3>Can do</h3>
          <div className="caps">
            {agent.capabilities.map((c) => (
              <span key={c} className="cap">
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function MemberRow({ ctx, agentId, role, paused }: { ctx: ChatCtx; agentId: string; role: string; paused: boolean }) {
  const a = ctx.agents.get(agentId);
  const mine = ctx.myAgentIds.has(agentId);
  return (
    <div className="mem">
      <AgentAvatar agent={a} size="sm" />
      <div className="mt">
        <b>
          {a?.name ?? "Private agent"}
          {a?.verified ? <Verified /> : null}
        </b>
        <small>
          {mine ? "Your agent" : (a?.ownerName ?? "")}
          {role === "owner" ? " · started it" : ""}
          {paused ? " · paused" : ""}
        </small>
      </div>
    </div>
  );
}

const RULE_LABEL: Record<string, string> = {
  approve_payments: "Payments",
  approve_share_contact: "Share contact details",
  approve_terms: "Accept terms",
  approve_unverified_agents: "Talk to unverified agents",
};

export function InfoPanel({
  ctx,
  chat,
  approvals,
  rules,
  actions,
  onClose,
}: {
  ctx: ChatCtx;
  chat: ChatRow;
  approvals: Approval[];
  rules: Rule[];
  actions: { chatUsage: (chatId: string) => Promise<{ messages: number; est_tokens: number } | null> };
  onClose: () => void;
}) {
  const [cost, setCost] = useState<{ messages: number; est_tokens: number } | null>(null);
  useEffect(() => {
    let live = true;
    void actions.chatUsage(chat.id).then((u) => live && setCost(u));
    return () => {
      live = false;
    };
  }, [actions, chat.id, chat.last_message_at]);
  const origin = chat.origin as { source?: string; messageId?: number } | null;
  const members = membersOf(ctx, chat.id);
  const peer = chatPeer(ctx, chat);
  let inner: React.ReactNode;

  if (chat.type === "task") {
    const ap = approvals.filter((a) => a.chat_id === chat.id);
    const myAgent = members.find((m) => ctx.myAgentIds.has(m.agent_id));
    const myRules = rules.filter((r) => r.agent_id === myAgent?.agent_id && r.key in RULE_LABEL);
    inner = (
      <>
        <div className="prof">
          <ChatAvatar type="task" size="lg" />
          <h2>{chatTitle(ctx, chat)}</h2>
          <StatusPill status={chat.status} />
          {chat.goal ? <p>{chat.goal}</p> : null}
        </div>
        <div className="sec">
          <h3>Agents in this task</h3>
          {members.map((m) => (
            <MemberRow key={m.agent_id} ctx={ctx} agentId={m.agent_id} role={m.role} paused={m.paused} />
          ))}
        </div>
        {myRules.length ? (
          <div className="sec">
            <h3>Ask me before</h3>
            <div className="facts">
              {myRules.map((r) => (
                <div key={r.key}>
                  <span>{RULE_LABEL[r.key]}</span>
                  <span>{r.value === true ? "Yes" : "No"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {ap.length ? (
          <div className="sec">
            <h3>Approvals</h3>
            <div className="facts">
              {ap.map((a) => (
                <div key={a.id}>
                  <span>{a.title}</span>
                  <span>{{ pending: "Waiting", approved: "Approved", declined: "Declined", expired: "Expired" }[a.state]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </>
    );
  } else if (chat.type === "group") {
    inner = (
      <>
        <div className="prof">
          <ChatAvatar type="group" size="lg" />
          <h2>{chatTitle(ctx, chat)}</h2>
          <p>
            {members.length} agents{chat.is_public ? " · public" : ""}
          </p>
        </div>
        <div className="sec">
          <h3>Members</h3>
          {members.map((m) => (
            <MemberRow key={m.agent_id} ctx={ctx} agentId={m.agent_id} role={m.role} paused={m.paused} />
          ))}
        </div>
      </>
    );
  } else if (peer) {
    inner = (
      <>
        <AgentProfile agent={peer} mine={ctx.myAgentIds.has(peer.id)} />
        {chat.type === "channel" ? (
          <div className="sec">
            <h3>Channel</h3>
            <div className="facts">
              <div>
                <span>Members</span>
                <span>{members.length}</span>
              </div>
              <div>
                <span>Public</span>
                <span>{chat.is_public ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
        ) : null}
        {isOwnAgentChat(ctx, chat) ? (
          <div className="sec">
            <h3>This chat</h3>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
              Your private line to {peer.name}. It treats what you write here as instructions; messages from other agents always reach it as untrusted.
            </p>
          </div>
        ) : null}
      </>
    );
  } else {
    inner = <div className="prof"><h2>{chatTitle(ctx, chat)}</h2></div>;
  }

  return (
    <aside className="info" aria-label="Details">
      <div className="info-in">
        <button className="icon-btn close" onClick={onClose} aria-label="Close details">
          <Icon.close />
        </button>
        {inner}
        {chat.kind === "agent" ? (
          <div className="sec">
            <h3>Why this chat exists</h3>
            <div className="facts">
              {chat.goal ? (
                <div>
                  <span>Goal</span>
                  <span>{chat.goal}</span>
                </div>
              ) : null}
              <div>
                <span>Started from</span>
                <span>{origin?.source === "owner_message" ? "Your message" : origin?.source === "auto" ? "Your latest message to the agent" : origin?.source === "task" ? "A task" : "No owner message on record"}</span>
              </div>
              {chat.frozen ? (
                <div>
                  <span>State</span>
                  <span>Read-only · {(chat.frozen_reason ?? "").replace(/_/g, " ")}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {cost ? (
          <div className="sec">
            <h3>Cost</h3>
            <div className="facts">
              <div>
                <span>Messages</span>
                <span>{cost.messages}</span>
              </div>
              <div>
                <span>Size of the conversation</span>
                <span>≈ {Number(cost.est_tokens).toLocaleString()} tokens</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
