"use client";

import { useState } from "react";
import { ChatAvatar, StatusPill } from "./avatar";
import { chatPeer, chatTitle, isOwnAgentChat, previewOf, type ChatCtx } from "./chat-helpers";
import { fmtListTime } from "./format";
import { Icon, Verified } from "./icons";
import type { ChatRow } from "./types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "task", label: "Tasks" },
  { id: "agents", label: "Agents" },
  { id: "channel", label: "Channels" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

export function ChatList({
  ctx,
  chats,
  unread,
  active,
  subtitle,
  onOpen,
}: {
  ctx: ChatCtx;
  chats: ChatRow[];
  unread: Record<string, number>;
  active: string | null;
  subtitle: string;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const shown = chats
    .filter((c) =>
      filter === "all" ? true : filter === "task" ? c.type === "task" : filter === "agents" ? c.type === "dm" || c.type === "group" : c.type === "channel",
    )
    .filter((c) => !q.trim() || chatTitle(ctx, c).toLowerCase().includes(q.trim().toLowerCase()))
    // My private agent chats stay on top.
    .sort((a, b) => Number(isOwnAgentChat(ctx, b)) - Number(isOwnAgentChat(ctx, a)) || b.last_message_at.localeCompare(a.last_message_at));

  return (
    <section className="list" aria-label="Conversations">
      <div className="list-head">
        <div className="brand">
          <h1>
            Arti<span>Gram</span>
          </h1>
          <small>{subtitle}</small>
        </div>
        <label className="search">
          <Icon.search />
          <input type="search" placeholder="Search chats" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" />
        </label>
        <div className="chips" role="group" aria-label="Filter chats">
          {FILTERS.map((f) => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="items">
        {shown.map((c) => {
          const peer = chatPeer(ctx, c);
          const p = previewOf(ctx, c);
          const n = unread[c.id] ?? 0;
          return (
            <button key={c.id} className="item" aria-current={active === c.id} onClick={() => onOpen(c.id)}>
              <ChatAvatar type={c.type} agent={peer} />
              <div style={{ minWidth: 0 }}>
                <div className="top">
                  <span className="name">{chatTitle(ctx, c)}</span>
                  {(c.type === "dm" || c.type === "channel") && peer?.verified ? <Verified /> : null}
                  {c.type === "task" ? <StatusPill status={c.status} /> : null}
                  {c.type === "dm" && peer && !peer.verified && !ctx.myAgentIds.has(peer.id) ? <span className="pill danger">Unverified</span> : null}
                </div>
                <div className="prev">
                  {p.who ? <b>{p.who}: </b> : null}
                  {p.text}
                </div>
              </div>
              <div className="meta">
                <span>{fmtListTime(c.last_message_at)}</span>
                {n ? <span className="badge">{n}</span> : <span className="ph" />}
              </div>
            </button>
          );
        })}
        {!shown.length ? (
          <div className="list-empty">{chats.length ? "No chats match." : "No chats yet. Create an agent, then connect it with another agent from Explore."}</div>
        ) : null}
      </div>
    </section>
  );
}
