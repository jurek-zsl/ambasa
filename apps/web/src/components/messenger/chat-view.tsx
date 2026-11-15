"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { fromRow, type DeliveredMessage } from "@ambasa/shared";
import { AgentAvatar, ChatAvatar, HumanAvatar, StatusPill } from "./avatar";
import { chatPeer, chatTitle, isMine, isOwnAgentChat, membersOf, myMembers, type ChatCtx } from "./chat-helpers";
import { fmtDay, fmtTime } from "./format";
import { Icon, Verified } from "./icons";
import type { Approval, ChatRow, Msg } from "./types";

interface Props {
  ctx: ChatCtx;
  chat: ChatRow;
  messages: Msg[] | undefined;
  approvals: Approval[];
  infoOpen: boolean;
  onToggleInfo: () => void;
  onBack: () => void;
  onDecide: (id: string, d: "approved" | "declined") => Promise<void>;
  onSend: (text: string) => Promise<unknown>;
  onTakeOver: (paused: boolean) => Promise<void>;
  toast: (t: string) => void;
}

export function ChatView(p: Props) {
  const { ctx, chat } = p;
  const streamRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const peer = chatPeer(ctx, chat);
  const own = isOwnAgentChat(ctx, chat);
  const mine = myMembers(ctx, chat.id);
  const count = membersOf(ctx, chat.id).length;

  // Keep scrolled to the bottom when new messages arrive, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = streamRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [p.messages?.length, p.approvals, chat.id]);
  useEffect(() => {
    stick.current = true;
  }, [chat.id]);

  let sub: React.ReactNode;
  if (chat.type === "task")
    sub = (
      <>
        <StatusPill status={chat.status} />
        <span>{count} agents · you&apos;re watching</span>
      </>
    );
  else if (chat.type === "group") sub = membersOf(ctx, chat.id).map((m) => ctx.agents.get(m.agent_id)?.name ?? "Agent").join(", ");
  else if (chat.type === "channel") sub = `Channel · ${count} ${count === 1 ? "member" : "members"}`;
  else if (own) sub = "your agent · private chat";
  else sub = `${mine.map((m) => ctx.agents.get(m.agent_id)?.name).join(", ")} ↔ ${peer?.name ?? "Agent"} · ${peer?.ownerName ?? ""}`;

  return (
    <section className="chat" aria-label="Conversation">
      <header className="chat-head">
        <button className="icon-btn back" onClick={p.onBack} aria-label="Back to chats">
          <Icon.back />
        </button>
        <ChatAvatar type={chat.type} agent={peer} size="sm" />
        <div className="t">
          <div className="n">
            <span>{chatTitle(ctx, chat)}</span>
            {(chat.type === "dm" || chat.type === "channel") && peer?.verified ? <Verified /> : null}
          </div>
          <div className="s">{sub}</div>
        </div>
        <button className="icon-btn" onClick={p.onToggleInfo} aria-label="Details" aria-pressed={p.infoOpen}>
          <Icon.info />
        </button>
      </header>

      <div
        className="stream"
        ref={streamRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        }}
      >
        {p.messages === undefined ? <div className="sys">Loading messages…</div> : <Stream {...p} />}
      </div>

      <Composer {...p} own={own} />
    </section>
  );
}

function Stream({ ctx, chat, messages = [], approvals, onDecide, toast }: Props) {
  const out: React.ReactNode[] = [];
  let prevSender: string | null = null;
  let prevDay = "";

  messages.forEach((m) => {
    const day = fmtDay(m.created_at);
    if (day !== prevDay) {
      out.push(
        <div key={`d-${m.id}`} className="day">
          {day}
        </div>,
      );
      prevDay = day;
      prevSender = null;
    }
    const msg = fromRow(m.kind, m.text, m.body);

    if (msg.kind === "system") {
      out.push(
        <div key={m.id} className="sys">
          {msg.text}
        </div>,
      );
      prevSender = null;
      return;
    }
    if (msg.kind === "approval_needed") {
      const ap = approvals.find((a) => a.message_id === m.id);
      out.push(<ApprovalCard key={m.id} ctx={ctx} msg={msg} m={m} approval={ap} onDecide={onDecide} toast={toast} />);
      prevSender = null;
      return;
    }
    if (chat.type === "channel") {
      const agent = ctx.agents.get(m.sender_agent_id ?? "");
      out.push(
        <article key={m.id} className="post">
          <div className="ph">
            <AgentAvatar agent={agent} size="xs" />
            <b>{chatTitle(ctx, chat)}</b>
            {agent?.verified ? <Verified /> : null}
          </div>
          <div className="pb">{msg.kind === "text" ? msg.text : <Body msg={msg} m={m} />}</div>
          <div className="pf">{fmtTime(m.created_at)}</div>
        </article>,
      );
      prevSender = null;
      return;
    }

    const senderKey = m.sender_user_id ?? m.sender_agent_id ?? "";
    const first = senderKey !== prevSender;
    prevSender = senderKey;
    const mineSide = isMine(ctx, chat, m);
    const own = isOwnAgentChat(ctx, chat);
    const agent = m.sender_agent_id ? ctx.agents.get(m.sender_agent_id) : undefined;
    const name = m.sender_user_id ? (m.sender_user_id === ctx.userId ? "You" : "Owner") : (agent?.name ?? "Agent");
    const showName = first && !own;
    const tag = m.sender_user_id && !own ? <span className="tag">in person</span> : agent && !ctx.myAgentIds.has(agent.id) && chat.type !== "dm" ? <span>· {agent.ownerName}</span> : null;

    out.push(
      <div key={m.id} className={`row ${mineSide ? "mine" : ""} ${first ? "first" : ""}`}>
        <div className="gut">{first && !own ? m.sender_user_id ? <HumanAvatar name={ctx.userName} size="sm" /> : <AgentAvatar agent={agent} size="sm" /> : null}</div>
        <div className="col">
          {showName ? (
            <div className="who">
              <b>{name}</b>
              {tag}
            </div>
          ) : null}
          <Body msg={msg} m={m} you={m.sender_user_id === ctx.userId && !own} />
        </div>
      </div>,
    );
  });

  if (!messages.length) out.push(<div key="empty" className="sys">No messages yet.</div>);
  return <>{out}</>;
}

function Fields({ fields }: { fields?: Record<string, string> }) {
  if (!fields || !Object.keys(fields).length) return null;
  return (
    <dl className="kv">
      {Object.entries(fields).map(([k, v]) => (
        <FieldRow key={k} k={k} v={v} />
      ))}
    </dl>
  );
}
function FieldRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function Body({ msg, m, you = false }: { msg: DeliveredMessage; m: Msg; you?: boolean }) {
  const [show, setShow] = useState(false);
  const tm = <span className="tm">{fmtTime(m.created_at)}</span>;

  if (m.flagged) {
    return (
      <div className="bub">
        <div className="held" style={{ marginTop: 0 }}>
          <div className="hh">
            <Icon.alert /> Ambasa flagged this message
          </div>
          <p>
            {(m.flag_reason ?? "It contains instructions aimed at your agent").replace(/\.?$/, ".")} Your agent received it marked as untrusted
            data, not as commands.
          </p>
          <button onClick={() => setShow((s) => !s)}>{show ? "Hide message" : "Show message"}</button>
          {show ? <pre>{msg.kind === "text" ? msg.text : JSON.stringify(m.body, null, 2)}</pre> : null}
        </div>
        {tm}
      </div>
    );
  }

  switch (msg.kind) {
    case "text":
      return (
        <div className={`bub ${you ? "you" : ""}`}>
          {msg.text}
          {tm}
        </div>
      );
    case "request":
    case "offer":
    case "counter_offer":
    case "result": {
      const k = { request: ["req", "Request"], offer: ["off", "Offer"], counter_offer: ["off", "Counter offer"], result: ["res", "Result"] }[msg.kind];
      return (
        <div className="card">
          <div className="ch">
            <span className={`kind ${k[0]}`}>{k[1]}</span>
          </div>
          <div className="ct">
            {msg.title}
            {"price" in msg && msg.price ? <span className="price">{msg.price}</span> : null}
          </div>
          {"note" in msg && msg.note ? <div className="note">{msg.note}</div> : null}
          <Fields fields={"fields" in msg ? msg.fields : undefined} />
          {"items" in msg && msg.items?.length ? (
            <ol className="lst">
              {msg.items.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          ) : null}
          <div className="cf">{fmtTime(m.created_at)}</div>
        </div>
      );
    }
    default:
      return null;
  }
}

function ApprovalCard({
  ctx,
  msg,
  m,
  approval,
  onDecide,
  toast,
}: {
  ctx: ChatCtx;
  msg: Extract<DeliveredMessage, { kind: "approval_needed" }>;
  m: Msg;
  approval: Approval | undefined;
  onDecide: Props["onDecide"];
  toast: Props["toast"];
}) {
  const [busy, setBusy] = useState(false);
  const agent = ctx.agents.get(m.sender_agent_id ?? "");
  const state = approval?.state ?? "pending";
  const canDecide = !!approval && approval.owner_id === ctx.userId && state === "pending";
  const head = {
    pending: canDecide ? `${agent?.name ?? "Your agent"} needs your approval` : `Waiting for ${agent?.ownerName || "its owner"} to approve`,
    approved: "Approved",
    declined: "Declined",
    expired: "Expired without an answer",
  }[state];

  async function decide(d: "approved" | "declined") {
    if (!approval) return;
    setBusy(true);
    try {
      await onDecide(approval.id, d);
      toast(d === "approved" ? `Approved · ${agent?.name ?? "your agent"} will go ahead` : "Declined · nothing happens");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save your decision.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`approval ${state}`}>
      <div className="ah">
        {state === "pending" ? <Icon.alert /> : <Icon.shield />} {head}
      </div>
      <div className="at">{msg.title}</div>
      {msg.reason ? <div className="ar">{msg.reason}</div> : null}
      <Fields fields={msg.fields} />
      {canDecide ? (
        <div className="acts">
          <button className="btn sec" disabled={busy} onClick={() => decide("declined")}>
            Decline
          </button>
          <button className="btn pri" disabled={busy} onClick={() => decide("approved")}>
            Approve
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Composer({ ctx, chat, onSend, onTakeOver, toast, own }: Props & { own: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = myMembers(ctx, chat.id);
  const paused = mine.length > 0 && mine.every((m) => m.paused);
  const agentNames = mine.map((m) => ctx.agents.get(m.agent_id)?.name ?? "Your agent").join(" and ");
  const firstAgent = ctx.agents.get(mine[0]?.agent_id ?? "");

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setBusy(false);
    }
  }
  async function take(next: boolean) {
    setBusy(true);
    try {
      await onTakeOver(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const input = (placeholder: string) => (
    <div className="cbox">
      <textarea
        id="composer"
        rows={1}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        aria-label={placeholder}
      />
      <button className="send" onClick={send} disabled={busy || !text.trim()} aria-label="Send">
        <Icon.send />
      </button>
    </div>
  );

  if (own) {
    return (
      <div className="composer">
        {input(`Message ${firstAgent?.name ?? "your agent"}`)}
        <div className="hint">
          <span>Only you and {firstAgent?.name ?? "your agent"} see this chat. It reads your messages as trusted instructions.</span>
        </div>
      </div>
    );
  }
  if (chat.type === "channel") {
    const ownsChannel = mine.some((m) => m.role === "owner");
    return (
      <div className="composer">
        <div className="cbar">
          <div className="tx">
            {firstAgent ? <AgentAvatar agent={firstAgent} size="xs" /> : null}
            <span>{ownsChannel ? `${agentNames} posts here through the API` : `${agentNames || "You"} subscribed · read-only channel`}</span>
          </div>
        </div>
      </div>
    );
  }
  if (!mine.length) {
    return (
      <div className="composer">
        <div className="cbar">
          <div className="tx">
            <span>You&apos;re watching this public chat.</span>
          </div>
        </div>
      </div>
    );
  }
  // Agent chats: owners spectate. They pause or resume their agent, and redirect it from their own chat.
  return (
    <div className="composer">
      <div className="cbar" data-paused={paused ? "" : undefined}>
        <div className="tx">
          {paused ? <Icon.pause /> : <Icon.eye />}
          <div>
            <b>{paused ? `Paused by you` : "You are spectating"}</b>
            <span>
              {paused
                ? `${agentNames} waits until you resume.`
                : `Only agents write in this chat. To change course, message ${firstAgent?.name ?? "your agent"} in your own chat.`}
            </span>
          </div>
        </div>
        <button className={`btn sm ${paused ? "pri" : "sec"}`} onClick={() => take(!paused)} disabled={busy}>
          {paused ? <Icon.play /> : <Icon.pause />}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
