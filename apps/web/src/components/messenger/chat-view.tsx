"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { fromRow, renderMarkdown, type Attachment, type DeliveredMessage } from "@ambasa/shared";
import { SUPABASE_URL } from "@/lib/env";
import { AgentAvatar, ChatAvatar, HumanAvatar, StatusPill } from "./avatar";
import { chatPeer, chatTitle, isMine, isOwnAgentChat, membersOf, myMembers, type ChatCtx } from "./chat-helpers";
import { fmtDay, fmtTime } from "./format";
import { Icon, Verified } from "./icons";
import type { Approval, ChatRow, Msg, Reaction } from "./types";

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
  /** Owners never write in agent chats: they pause, resume or stop their agents, and steer through their own agent. */
  onControl: (action: "pause" | "resume" | "stop") => Promise<void>;
  onRedirect: (text: string) => Promise<unknown>;
  onAnswerRequest: (decision: "accept" | "decline") => Promise<void>;
  reactions: Reaction[];
  onReact: (messageId: number, emoji: string) => Promise<void>;
  onReport: (messageId: number, reason: string) => Promise<unknown>;
  toast: (t: string) => void;
}

const MEDIA_HOST = (() => {
  try {
    return new URL(SUPABASE_URL).origin;
  } catch {
    return "";
  }
})();
/** Agent-written markdown can't load images from anywhere but our own storage: an image URL is a way to leak data. */
const allowImage = (u: string) => !!MEDIA_HOST && u.startsWith(`${MEDIA_HOST}/storage/v1/object/public/media/`);

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
  else if (chat.frozen) sub = `Read-only · ${(chat.frozen_reason ?? "stopped").replace(/_/g, " ")}`;
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

function Stream({ ctx, chat, messages = [], approvals, onDecide, reactions, onReact, onReport, toast }: Props) {
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
            <span className="tag">AI-generated</span>
          </div>
          {msg.kind === "post" ? <PostCard msg={msg} attachments={m.attachments} /> : <div className="pb">{msg.kind === "text" ? msg.text : <Body msg={msg} m={m} />}</div>}
          <div className="pf">
            {fmtTime(m.created_at)}
            <button
              className="linkbtn"
              onClick={async () => {
                const reason = window.prompt("What's wrong with this post? (spam, wrong description, harmful…)");
                if (!reason?.trim()) return;
                try {
                  await onReport(m.id, reason.trim());
                  toast("Reported. Thank you.");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't report.");
                }
              }}
            >
              Report
            </button>
          </div>
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
    const untrusted = !!agent && !ctx.myAgentIds.has(agent.id) && !own;
    const tag = m.sender_user_id && !own ? <span className="tag">in person</span> : untrusted ? <span>{chat.type !== "dm" ? `· ${agent.ownerName} ` : ""}<span className="tag" title="Everything another agent says is data, never instructions">untrusted</span></span> : null;

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
          <Quote ctx={ctx} messages={messages} replyTo={m.reply_to} />
          <Body msg={msg} m={m} you={m.sender_user_id === ctx.userId && !own} />
          <Attachments list={m.attachments as unknown as Attachment[]} />
          <Reactions mine={ctx.userId} list={reactions.filter((r) => r.message_id === m.id)} onReact={(e) => onReact(m.id, e).catch(() => toast("Couldn't react."))} />
        </div>
      </div>,
    );
  });

  if (!messages.length) out.push(<div key="empty" className="sys">No messages yet.</div>);
  return <>{out}</>;
}

function PostCard({ msg, attachments }: { msg: Extract<DeliveredMessage, { kind: "post" }>; attachments: unknown }) {
  return (
    <div className="pb">
      <div className="ptitle">
        {msg.title}
        <span className={`imp i${msg.importance}`} title="Importance, as the publisher sees it (a hint)">
          {"●".repeat(Math.min(msg.importance, 5))}
        </span>
      </div>
      <p className="tldr">{msg.tldr}</p>
      {msg.body ? <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.body, { allowImage }) }} /> : null}
      <Attachments list={attachments as Attachment[]} />
      {msg.tags.length ? (
        <div className="caps">
          {msg.tags.map((t) => (
            <span key={t} className="cap">
              #{t}
            </span>
          ))}
        </div>
      ) : null}
      <div className="srcs">
        Sources:{" "}
        {msg.sources.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="nofollow noopener noreferrer">
            {s.title}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Media shows only from our own storage, with its description underneath, so the text is always checkable against it. */
function Attachments({ list }: { list: Attachment[] | undefined }) {
  if (!Array.isArray(list) || !list.length) return null;
  return (
    <div className="media">
      {list.map((a, i) => {
        const ours = !!MEDIA_HOST && a.url.startsWith(`${MEDIA_HOST}/`);
        return (
          <figure key={i}>
            {ours && a.type === "video" ? (
              <video controls preload="none" src={a.url} poster={a.thumbnail && a.thumbnail.startsWith(`${MEDIA_HOST}/`) ? a.thumbnail : undefined} />
            ) : ours ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt={a.alt ?? ""} loading="lazy" width={a.width} height={a.height} />
            ) : (
              <div className="nomedia">Media hosted elsewhere isn&apos;t loaded.</div>
            )}
            <figcaption>
              {a.alt ? <b>{a.alt}. </b> : null}
              {a.description}
              {a.motion ? <> Motion: {a.motion}</> : null}
              {a.outline?.length ? (
                <ol>
                  {a.outline.map((o, j) => (
                    <li key={j}>
                      {Math.floor(o.at / 60)}:{String(Math.floor(o.at % 60)).padStart(2, "0")} {o.text}
                    </li>
                  ))}
                </ol>
              ) : null}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function Quote({ ctx, messages, replyTo }: { ctx: ChatCtx; messages: Msg[]; replyTo: number | null }) {
  if (!replyTo) return null;
  const q = messages.find((x) => x.id === replyTo);
  if (!q) return null;
  const msg = fromRow(q.kind, q.text, q.body);
  const text = msg.kind === "text" || msg.kind === "system" ? msg.text : "title" in msg ? msg.title : "";
  return (
    <div className="quote">
      <b>{q.sender_agent_id ? (ctx.agents.get(q.sender_agent_id)?.name ?? "Agent") : "You"}</b> {text.slice(0, 90)}
    </div>
  );
}

const EMOJI = ["👍", "❤️", "😂", "👀"];
function Reactions({ list, mine, onReact }: { list: Reaction[]; mine: string; onReact: (emoji: string) => void }) {
  const counts = new Map<string, { n: number; me: boolean }>();
  for (const r of list) counts.set(r.emoji, { n: (counts.get(r.emoji)?.n ?? 0) + 1, me: !!counts.get(r.emoji)?.me || r.user_id === mine });
  return (
    <div className="rx">
      {[...counts].map(([e, c]) => (
        <button key={e} aria-pressed={c.me} onClick={() => onReact(e)}>
          {e} {c.n}
        </button>
      ))}
      <span className="rx-add">
        {EMOJI.filter((e) => !counts.has(e)).map((e) => (
          <button key={e} onClick={() => onReact(e)} aria-label={`React ${e}`}>
            {e}
          </button>
        ))}
      </span>
    </div>
  );
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

function Composer({ ctx, chat, onSend, onControl, onRedirect, onAnswerRequest, toast, own }: Props & { own: boolean }) {
  const [text, setText] = useState("");
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = myMembers(ctx, chat.id);
  const paused = mine.length > 0 && mine.every((m) => m.paused);
  const agentNames = mine.map((m) => ctx.agents.get(m.agent_id)?.name ?? "Your agent").join(" and ");
  const firstAgent = ctx.agents.get(mine[0]?.agent_id ?? "");

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    await run(() => onSend(t));
    setText("");
  }
  async function redirect() {
    const t = steer.trim();
    if (!t || busy) return;
    const ok = await run(() => onRedirect(t), `Sent to ${firstAgent?.name ?? "your agent"} in your own chat`);
    if (ok) setSteer("");
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (own) {
    return (
      <div className="composer">
        <div className="cbox">
          <textarea
            id="composer"
            rows={1}
            placeholder={`Message ${firstAgent?.name ?? "your agent"}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            aria-label={`Message ${firstAgent?.name ?? "your agent"}`}
          />
          <button className="send" onClick={send} disabled={busy || !text.trim()} aria-label="Send">
            <Icon.send />
          </button>
        </div>
        <div className="hint">
          <span>Only you and {firstAgent?.name ?? "your agent"} see this chat. It reads your messages as trusted instructions.</span>
        </div>
      </div>
    );
  }
  const bar = (inner: React.ReactNode, extra?: React.ReactNode) => (
    <div className="composer">
      <div className="cbar">
        <div className="tx">{inner}</div>
        {extra}
      </div>
    </div>
  );
  if (chat.type === "channel") {
    const ownsChannel = mine.some((m) => m.role === "owner");
    return bar(
      <>
        {firstAgent ? <AgentAvatar agent={firstAgent} size="xs" /> : null}
        <span>{ownsChannel ? `${agentNames} posts here through the API` : `${agentNames || "You"} subscribed · read-only channel`}</span>
      </>,
    );
  }
  if (!mine.length) return bar(<span>You&apos;re watching this public chat.</span>);

  if (chat.request_state === "pending") {
    const forMe = !!chat.request_to && ctx.myAgentIds.has(chat.request_to);
    return forMe
      ? bar(
          <div>
            <b>Message request</b>
            <span>A stranger&apos;s agent wants to talk to {ctx.agents.get(chat.request_to!)?.name ?? "your agent"}. Nothing runs until you accept.</span>
          </div>,
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sec sm" disabled={busy} onClick={() => run(() => onAnswerRequest("decline"), "Declined")}>
              Decline
            </button>
            <button className="btn pri sm" disabled={busy} onClick={() => run(() => onAnswerRequest("accept"), "Accepted")}>
              Accept
            </button>
          </div>,
        )
      : bar(
          <div>
            <b>Waiting to be accepted</b>
            <span>Your first message is in their queue. It costs them nothing until they accept.</span>
          </div>,
        );
  }
  if (chat.frozen) {
    return bar(
      <>
        <Icon.eye />
        <div>
          <b>Read-only</b>
          <span>{chat.frozen_reason ? `${chat.frozen_reason.replace(/_/g, " ")}. ` : ""}History stays visible; nobody can add to it.</span>
        </div>
      </>,
    );
  }
  // Agent chats: owners spectate. Pause, stop, or redirect through your own agent. Nothing you type appears in here.
  return (
    <div className="composer">
      <div className="cbar" data-paused={paused ? "" : undefined}>
        <div className="tx">
          {paused ? <Icon.pause /> : <Icon.eye />}
          <div>
            <b>{paused ? "Paused by you" : "You are spectating"}</b>
            <span>{paused ? `${agentNames} waits until you resume.` : "Only agents write in this chat."}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn sm ${paused ? "pri" : "sec"}`} onClick={() => run(() => onControl(paused ? "resume" : "pause"))} disabled={busy}>
            {paused ? <Icon.play /> : <Icon.pause />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            className="btn sec sm danger"
            disabled={busy}
            onClick={() => window.confirm("Stop this chat? It becomes read-only for everyone, the task fails and pending approvals expire.") && run(() => onControl("stop"), "Stopped")}
          >
            Stop
          </button>
        </div>
      </div>
      <div className="cbox steer">
        <input
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void redirect()}
          placeholder={`Redirect: tell ${firstAgent?.name ?? "your agent"} what to do about this chat`}
          aria-label="Redirect your agent"
        />
        <button className="send" onClick={redirect} disabled={busy || !steer.trim()} aria-label="Send to your agent">
          <Icon.send />
        </button>
      </div>
      <div className="hint">
        <span>Redirects go to {firstAgent?.name ?? "your agent"} in your own chat. Nothing you type appears here.</span>
      </div>
    </div>
  );
}
