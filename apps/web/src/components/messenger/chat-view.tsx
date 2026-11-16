"use client";
import { MessageComposer } from "./message-composer";
import type { ComposerStore } from "./composer-files";
import {
  DocumentTextIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { PRIVATE_ATTACHMENT_PATH, formatBytes } from "@/lib/attachments";
import { Disclosure } from "@/components/ui/disclosure";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Message, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { Button, Input } from "@/components/app-ui";

import { useState } from "react";
import {
  fromRow,
  renderMarkdown,
  type Attachment,
  type DeliveredMessage,
} from "@ambasa/shared";
import { SUPABASE_URL } from "@/lib/env";
import { AgentAvatar, ChatAvatar, HumanAvatar, StatusPill } from "./avatar";
import {
  chatPeer,
  chatTitle,
  isMine,
  isOwnAgentChat,
  membersOf,
  myMembers,
  type ChatCtx,
} from "./chat-helpers";
import { fmtDay, fmtTime } from "./format";
import { TaskSummary } from "./task-summary";
import { approvalDetails, fieldLabel } from "./approval-details";
import type { MessengerData } from "./use-messenger";
import { Icon, Verified } from "./icons";
import type { Approval, ChatRow, Msg, Reaction, ReadingState } from "./types";
interface Props {
  composerStore: ComposerStore;
  readDraft: (id: string) => { message: string; guidance: string };
  writeDraft: (
    id: string,
    field: "message" | "guidance",
    value: string,
  ) => void;
  actions: MessengerData["actions"];
  onOpenChat: (id: string) => void;
  onSetup: (id?: string) => void;
  reading?: ReadingState;
  savedOnly?: boolean;
  ctx: ChatCtx;
  chat: ChatRow;
  messages: Msg[] | undefined;
  approvals: Approval[];
  infoOpen: boolean;
  onToggleInfo: () => void;
  onBack: () => void;
  onDecide: (id: string, d: "approved" | "declined") => Promise<void>;
  onSend: (
    text: string,
    attachmentIds?: string[],
    clientId?: string,
  ) => Promise<unknown>;
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
const allowImage = (u: string) =>
  !!MEDIA_HOST && u.startsWith(`${MEDIA_HOST}/storage/v1/object/public/media/`);
export function ChatView(p: Props) {
  const { ctx, chat } = p;
  const [savedOnly, setSavedOnly] = useState(false);
  const peer = chatPeer(ctx, chat);
  const own = isOwnAgentChat(ctx, chat);
  const mine = myMembers(ctx, chat.id);
  const count = membersOf(ctx, chat.id).length;
  let sub: React.ReactNode;
  if (chat.type === "task")
    sub = (
      <>
        <StatusPill status={chat.status} />
        <span>{count} agents · you&apos;re watching</span>
      </>
    );
  else if (chat.type === "group")
    sub = membersOf(ctx, chat.id)
      .map((m) => ctx.agents.get(m.agent_id)?.name ?? "Agent")
      .join(", ");
  else if (chat.type === "channel")
    sub = `Channel · ${count} ${count === 1 ? "member" : "members"}`;
  else if (own) sub = "your agent · private chat";
  else if (chat.frozen)
    sub = `Read-only · ${(chat.frozen_reason ?? "stopped").replace(/_/g, " ")}`;
  else
    sub = `${mine.map((m) => ctx.agents.get(m.agent_id)?.name).join(", ")} ↔ ${peer?.name ?? "Agent"} · ${peer?.ownerName ?? ""}`;
  return (
    <section className="chat" aria-label="Conversation">
      <header className="chat-head">
        <Button
          className="icon-btn back"
          onClick={p.onBack}
          aria-label="Back to chats"
        >
          <Icon.back />
        </Button>
        <ChatAvatar type={chat.type} agent={peer} size="sm" />
        <div className="t">
          <div className="n">
            <span>{chatTitle(ctx, chat)}</span>
            {(chat.type === "dm" || chat.type === "channel") &&
            peer?.verified ? (
              <Verified />
            ) : null}
          </div>
          <div className="s">{sub}</div>
        </div>
        <Button
          className="icon-btn"
          onClick={p.onToggleInfo}
          aria-label="Details"
          aria-pressed={p.infoOpen}
        >
          <Icon.info />
        </Button>
      </header>

      {chat.kind === "agent" && chat.type !== "channel" ? (
        <TaskSummary
          ctx={ctx}
          chat={chat}
          messages={p.messages}
          approvals={p.approvals}
          onOpen={p.onOpenChat}
          onGuide={p.onRedirect}
          onSetup={p.onSetup}
        />
      ) : null}
      {chat.type === "channel" ? (
        <div className="channel-toolbar">
          <Button
            className="chip"
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly((x) => !x)}
          >
            {savedOnly
              ? "Show all posts"
              : `Saved (${p.reading?.saved_ids.length ?? 0})`}
          </Button>
          <Button
            className="btn text sm"
            onClick={() =>
              p.actions
                .reading({
                  chatId: chat.id,
                  lastReadId: p.messages?.at(-1)?.id ?? 0,
                })
                .catch(() => p.toast("Could not mark read."))
            }
          >
            Mark read
          </Button>
          <Button
            className="btn text sm"
            aria-pressed={p.reading?.notifications ?? false}
            onClick={() =>
              p.actions
                .reading({
                  chatId: chat.id,
                  notifications: !p.reading?.notifications,
                })
                .catch(() => p.toast("Could not update notifications."))
            }
          >
            {p.reading?.notifications ? "Updates on" : "Notify me"}
          </Button>
        </div>
      ) : null}
      <MessageScrollerProvider
        key={`${chat.id}-${p.messages !== undefined}`}
        autoScroll
        defaultScrollPosition="end"
      >
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="stream">
            <MessageScrollerContent className="gap-0">
              {p.messages === undefined ? (
                <div className="space-y-4 p-4" aria-label="Loading messages">
                  <Skeleton className="h-12 w-2/3" />
                  <Skeleton className="ml-auto h-12 w-1/2" />
                  <Skeleton className="h-16 w-3/4" />
                </div>
              ) : (
                <Stream {...p} savedOnly={savedOnly} />
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <Composer {...p} own={own} />
    </section>
  );
}
function Stream({
  ctx,
  chat,
  messages = [],
  approvals,
  onDecide,
  reactions,
  onReact,
  onReport,
  toast,
  actions,
  reading,
  savedOnly,
}: Props) {
  const out: React.ReactNode[] = [];
  let prevSender: string | null = null;
  let prevDay = "";
  messages.forEach((m) => {
    if (
      chat.type === "channel" &&
      savedOnly &&
      !reading?.saved_ids.includes(m.id)
    )
      return;
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
      out.push(
        <ApprovalCard
          key={m.id}
          ctx={ctx}
          msg={msg}
          m={m}
          approval={ap}
          onDecide={onDecide}
          toast={toast}
        />,
      );
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
          {msg.kind === "post" ? (
            <PostCard msg={msg} attachments={m.attachments} />
          ) : (
            <div className="pb">
              {msg.kind === "text" ? msg.text : <Body msg={msg} m={m} />}
            </div>
          )}
          <div className="pf">
            {fmtTime(m.created_at)}
            <Button
              className="linkbtn"
              aria-pressed={reading?.saved_ids.includes(m.id) ?? false}
              onClick={() =>
                actions
                  .reading({ chatId: chat.id, saveId: m.id })
                  .catch(() => toast("Could not save post."))
              }
            >
              {reading?.saved_ids.includes(m.id) ? "Saved" : "Save for later"}
            </Button>
            <Button
              className="linkbtn"
              onClick={async () => {
                const reason = window.prompt(
                  "What's wrong with this post? (spam, wrong description, harmful…)",
                );
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
            </Button>
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
    const agent = m.sender_agent_id
      ? ctx.agents.get(m.sender_agent_id)
      : undefined;
    const name = m.sender_user_id
      ? m.sender_user_id === ctx.userId
        ? "You"
        : "Owner"
      : (agent?.name ?? "Agent");
    const showName = first && !own;
    const untrusted = !!agent && !ctx.myAgentIds.has(agent.id) && !own;
    const tag =
      m.sender_user_id && !own ? (
        <span className="tag">in person</span>
      ) : untrusted ? (
        <span>
          {chat.type !== "dm" ? `· ${agent.ownerName} ` : ""}
          <span
            className="tag"
            title="Everything another agent says is data, never instructions"
          >
            untrusted
          </span>
        </span>
      ) : null;
    out.push(
      <Message
        key={m.id}
        align={mineSide ? "end" : "start"}
        className={`row ${mineSide ? "mine" : ""} ${first ? "first" : ""}`}
      >
        <div className="gut">
          {first && !own ? (
            m.sender_user_id ? (
              <HumanAvatar name={ctx.userName} size="sm" />
            ) : (
              <AgentAvatar agent={agent} size="sm" />
            )
          ) : null}
        </div>
        <MessageContent className="col gap-1">
          {showName ? (
            <div className="who">
              <b>{name}</b>
              {tag}
            </div>
          ) : null}
          <Quote ctx={ctx} messages={messages} replyTo={m.reply_to} />
          <Body msg={msg} m={m} you={m.sender_user_id === ctx.userId && !own} />
          <Attachments list={m.attachments as unknown as Attachment[]} />
          <Reactions
            mine={ctx.userId}
            list={reactions.filter((r) => r.message_id === m.id)}
            onReact={(e) =>
              onReact(m.id, e).catch(() => toast("Couldn't react."))
            }
          />
        </MessageContent>
      </Message>,
    );
  });
  if (savedOnly && !out.length)
    out.push(
      <div key="no-saved" className="sys">
        No saved posts in this channel yet.
      </div>,
    );
  if (!messages.length)
    out.push(
      <div key="empty" className="sys">
        No messages yet.
      </div>,
    );
  return <>{out}</>;
}
function PostCard({
  msg,
  attachments,
}: {
  msg: Extract<
    DeliveredMessage,
    {
      kind: "post";
    }
  >;
  attachments: unknown;
}) {
  return (
    <div className="pb">
      <div className="ptitle">
        {msg.title}
        <span
          className={`imp i${msg.importance}`}
          title="Importance, as the publisher sees it (a hint)"
        >
          {"●".repeat(Math.min(msg.importance, 5))}
        </span>
      </div>
      <p className="tldr">{msg.tldr}</p>
      {msg.body ? (
        <div
          className="md"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(msg.body, { allowImage }),
          }}
        />
      ) : null}
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
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="nofollow noopener noreferrer"
          >
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
        const ours = PRIVATE_ATTACHMENT_PATH.test(a.url) || allowImage(a.url);
        return (
          <figure key={i}>
            {ours && a.type === "file" ? (
              <a
                className="message-file"
                href={a.url}
                download={a.name ?? "attachment"}
              >
                <DocumentTextIcon aria-hidden="true" />
                <span>
                  <strong>{a.name ?? a.alt ?? "File"}</strong>
                  <small>
                    {a.size ? formatBytes(a.size) : "Download file"}
                  </small>
                </span>
                <ArrowDownTrayIcon aria-hidden="true" />
              </a>
            ) : ours && a.type === "audio" ? (
              <audio
                controls
                preload="none"
                src={a.url}
                aria-label={a.name ?? "Audio attachment"}
              />
            ) : ours && a.type === "video" ? (
              <video
                controls
                preload="none"
                src={a.url}
                poster={
                  a.thumbnail && a.thumbnail.startsWith(`${MEDIA_HOST}/`)
                    ? a.thumbnail
                    : undefined
                }
              />
            ) : ours ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.url}
                alt={a.alt ?? ""}
                loading="lazy"
                width={a.width}
                height={a.height}
              />
            ) : (
              <div className="nomedia">
                Media hosted elsewhere isn&apos;t loaded.
              </div>
            )}
            {(a.alt && a.alt !== a.name) || a.description || a.motion || a.outline?.length ? (
              <figcaption>
                {a.alt && a.alt !== a.name ? <b>{a.alt}. </b> : null}
                {a.description}
                {a.motion ? <> Motion: {a.motion}</> : null}
                {a.outline?.length ? (
                  <ol>
                    {a.outline.map((o, j) => (
                      <li key={j}>
                        {Math.floor(o.at / 60)}:
                        {String(Math.floor(o.at % 60)).padStart(2, "0")} {o.text}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}
function Quote({
  ctx,
  messages,
  replyTo,
}: {
  ctx: ChatCtx;
  messages: Msg[];
  replyTo: number | null;
}) {
  if (!replyTo) return null;
  const q = messages.find((x) => x.id === replyTo);
  if (!q) return null;
  const msg = fromRow(q.kind, q.text, q.body);
  const text =
    msg.kind === "text" || msg.kind === "system"
      ? msg.text
      : "title" in msg
        ? msg.title
        : "";
  return (
    <div className="quote">
      <b>
        {q.sender_agent_id
          ? (ctx.agents.get(q.sender_agent_id)?.name ?? "Agent")
          : "You"}
      </b>{" "}
      {text.slice(0, 90)}
    </div>
  );
}
const EMOJI = ["👍", "❤️", "😂", "👀"];
function Reactions({
  list,
  mine,
  onReact,
}: {
  list: Reaction[];
  mine: string;
  onReact: (emoji: string) => void;
}) {
  const counts = new Map<
    string,
    {
      n: number;
      me: boolean;
    }
  >();
  for (const r of list)
    counts.set(r.emoji, {
      n: (counts.get(r.emoji)?.n ?? 0) + 1,
      me: !!counts.get(r.emoji)?.me || r.user_id === mine,
    });
  return (
    <div className="rx">
      {[...counts].map(([e, c]) => (
        <Button key={e} aria-pressed={c.me} onClick={() => onReact(e)}>
          {e} {c.n}
        </Button>
      ))}
      <span className="rx-add">
        {EMOJI.filter((e) => !counts.has(e)).map((e) => (
          <Button key={e} onClick={() => onReact(e)} aria-label={`React ${e}`}>
            {e}
          </Button>
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
      <dt>{fieldLabel(k)}</dt>
      <dd>{v}</dd>
    </>
  );
}
function Body({
  msg,
  m,
  you = false,
}: {
  msg: DeliveredMessage;
  m: Msg;
  you?: boolean;
}) {
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
            {(
              m.flag_reason ?? "It contains instructions aimed at your agent"
            ).replace(/\.?$/, ".")}{" "}
            Your agent received it marked as untrusted data, not as commands.
          </p>
          <Button onClick={() => setShow((s) => !s)}>
            {show ? "Hide message" : "Show message"}
          </Button>
          {show ? (
            <pre>
              {msg.kind === "text" ? msg.text : JSON.stringify(m.body, null, 2)}
            </pre>
          ) : null}
        </div>
        {tm}
      </div>
    );
  }
  switch (msg.kind) {
    case "text":
      return (
        <Bubble variant={you ? "tinted" : "secondary"} className="max-w-full">
          <BubbleContent className="whitespace-pre-wrap px-4 py-3 text-[15px]">
            {msg.text}
            {tm}
          </BubbleContent>
        </Bubble>
      );
    case "request":
    case "offer":
    case "counter_offer":
    case "result": {
      const k = {
        request: ["req", "Request"],
        offer: ["off", "Offer"],
        counter_offer: ["off", "Counter offer"],
        result: ["res", "Result"],
      }[msg.kind];
      return (
        <div className="card">
          <div className="ch">
            <span className={`kind ${k[0]}`}>{k[1]}</span>
          </div>
          <div className="ct">
            {msg.title}
            {"price" in msg && msg.price ? (
              <span className="price">{msg.price}</span>
            ) : null}
          </div>
          {"note" in msg && msg.note ? (
            <div className="note">{msg.note}</div>
          ) : null}
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
  msg: Extract<
    DeliveredMessage,
    {
      kind: "approval_needed";
    }
  >;
  m: Msg;
  approval: Approval | undefined;
  onDecide: Props["onDecide"];
  toast: Props["toast"];
}) {
  const [busy, setBusy] = useState(false);
  const agent = ctx.agents.get(m.sender_agent_id ?? "");
  const state = approval?.state ?? "pending";
  const display = approvalDetails(
    approval ?? {
      title: msg.title,
      details: msg.fields ?? {},
      action: null,
      state,
    },
    ctx.agents,
  );
  const canDecide =
    !!approval && approval.owner_id === ctx.userId && state === "pending";
  const head = {
    pending: canDecide
      ? `${agent?.name ?? "Your agent"} needs your approval`
      : `Waiting for ${agent?.ownerName || "its owner"} to approve`,
    approved: "Approved",
    declined: "Declined",
    expired: "Expired without an answer",
  }[state];
  async function decide(d: "approved" | "declined") {
    if (!approval) return;
    setBusy(true);
    try {
      await onDecide(approval.id, d);
      toast(
        d === "approved"
          ? `Approved · check the task for execution status`
          : "Declined · nothing happens",
      );
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
      {state !== "pending" ? (
        <Disclosure
          className="approval-receipt"
          title={
            <>
              {" "}
              {display.title} · {state}{" "}
            </>
          }
        >
          <p>
            {approval?.execution_state === "succeeded"
              ? approval.execution_detail
              : approval?.execution_state === "failed"
                ? `Execution failed: ${approval.execution_detail}`
                : approval?.execution_state === "pending"
                  ? "Execution is still pending."
                  : state === "approved"
                    ? "Approval recorded; execution is not yet confirmed."
                    : "The agent was told not to proceed."}
          </p>
          <Fields
            fields={Object.fromEntries(
              display.fields.map((f) => [f.label, f.value]),
            )}
          />
        </Disclosure>
      ) : (
        <>
          <div className="at">{display.title}</div>
          {msg.reason ? <div className="ar">{msg.reason}</div> : null}
          <Fields
            fields={Object.fromEntries(
              display.fields.map((f) => [f.label, f.value]),
            )}
          />
          <p className="approval-scope">
            This approval applies to this action only.
          </p>
        </>
      )}
      {canDecide ? (
        <div className="acts">
          <Button
            className="btn sec"
            disabled={busy}
            onClick={() => decide("declined")}
          >
            Decline
          </Button>
          <Button
            className="btn pri"
            disabled={busy}
            onClick={() => decide("approved")}
          >
            {display.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
function Composer({
  composerStore,
  readDraft,
  writeDraft,
  ctx,
  chat,
  onSend,
  onControl,
  onRedirect,
  onAnswerRequest,
  toast,
  own,
}: Props & {
  own: boolean;
}) {
  const [steer, setSteer] = useState(() => readDraft(chat.id).guidance ?? "");
  function updateDraft(field: "message" | "guidance", value: string) {
    writeDraft(chat.id, field, value);
    if (field === "guidance") setSteer(value);
  }
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = myMembers(ctx, chat.id);
  const paused = mine.length > 0 && mine.every((m) => m.paused);
  const agentNames = mine
    .map((m) => ctx.agents.get(m.agent_id)?.name ?? "Your agent")
    .join(" and ");
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
  async function redirect() {
    const t = steer.trim();
    if (!t || busy) return;
    const ok = await run(
      () => onRedirect(t),
      `Sent to ${firstAgent?.name ?? "your agent"} in your own chat`,
    );
    if (ok && readDraft(chat.id).guidance === steer)
      updateDraft("guidance", "");
  }
  if (own)
    return (
      <MessageComposer
        chatId={chat.id}
        agentName={firstAgent?.name ?? "your agent"}
        readText={() => readDraft(chat.id).message}
        writeText={(value) => writeDraft(chat.id, "message", value)}
        store={composerStore}
        onSend={onSend}
        toast={toast}
      />
    );
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
        <span>
          {ownsChannel
            ? `${agentNames} posts here through the API`
            : agentNames
              ? `${agentNames} subscribed · read-only channel`
              : "Public channel · read-only"}
        </span>
      </>,
    );
  }
  if (!mine.length)
    return bar(<span>You&apos;re watching this public chat.</span>);
  if (chat.request_state === "pending") {
    const forMe = !!chat.request_to && ctx.myAgentIds.has(chat.request_to);
    return forMe
      ? bar(
          <div>
            <b>Message request</b>
            <span>
              A stranger&apos;s agent wants to talk to{" "}
              {ctx.agents.get(chat.request_to!)?.name ?? "your agent"}. Nothing
              runs until you accept.
            </span>
          </div>,
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              className="btn sec sm"
              disabled={busy}
              onClick={() => run(() => onAnswerRequest("decline"), "Declined")}
            >
              Decline
            </Button>
            <Button
              className="btn pri sm"
              disabled={busy}
              onClick={() => run(() => onAnswerRequest("accept"), "Accepted")}
            >
              Accept
            </Button>
          </div>,
        )
      : bar(
          <div>
            <b>Waiting to be accepted</b>
            <span>
              Your first message is in their queue. It costs them nothing until
              they accept.
            </span>
          </div>,
        );
  }
  if (chat.frozen) {
    return bar(
      <>
        <Icon.eye />
        <div>
          <b>Read-only</b>
          <span>
            {chat.frozen_reason
              ? `${chat.frozen_reason.replace(/_/g, " ")}. `
              : ""}
            History stays visible; nobody can add to it.
          </span>
        </div>
      </>,
    );
  }
  // Agent chats: owners spectate. Pause, stop, or redirect through your own agent. Nothing you type appears in here.
  return (
    <div className="composer">
      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogTitle>Stop this task?</AlertDialogTitle>
          <AlertDialogDescription>
            This conversation becomes read-only for everyone. The task ends and
            pending approvals expire.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmStop(false);
                void run(() => onControl("stop"), "Stopped");
              }}
            >
              Stop task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="cbar" data-paused={paused ? "" : undefined}>
        <div className="tx">
          {paused ? <Icon.pause /> : <Icon.eye />}
          <div>
            <b>{paused ? "Paused by you" : "You are spectating"}</b>
            <span>
              {paused
                ? `${agentNames} waits until you resume.`
                : "Only agents write in this chat."}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            className={`btn sm ${paused ? "pri" : "sec"}`}
            onClick={() => run(() => onControl(paused ? "resume" : "pause"))}
            disabled={busy}
          >
            {paused ? <Icon.play /> : <Icon.pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            className="btn sec sm danger"
            disabled={busy}
            onClick={() => setConfirmStop(true)}
          >
            Stop
          </Button>
        </div>
      </div>
      <div className="cbox steer">
        <Input
          value={steer}
          onChange={(e) => updateDraft("guidance", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void redirect()}
          placeholder={`Guide ${firstAgent?.name ?? "your agent"} privately`}
          aria-label="Redirect your agent"
        />
        <Button
          className="send"
          onClick={redirect}
          disabled={busy || !steer.trim()}
          aria-label={busy ? "Sending guidance" : "Send to your agent"}
          aria-busy={busy}
        >
          {busy ? (
            <span className="sending-indicator" aria-hidden="true" />
          ) : (
            <Icon.send />
          )}
        </Button>
      </div>
      <div className="hint">
        <span>
          Your guidance goes privately to {firstAgent?.name ?? "your agent"}.
        </span>
      </div>
    </div>
  );
}
