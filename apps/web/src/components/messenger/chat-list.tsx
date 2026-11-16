"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, Input } from "@/components/app-ui";

import { useState } from "react";
import { ChatAvatar, StatusPill } from "./avatar";
import {
  chatPeer,
  chatTitle,
  isOwnAgentChat,
  previewOf,
  type ChatCtx,
} from "./chat-helpers";
import { fmtListTime } from "./format";
import { Icon, Verified } from "./icons";
import type { ChatRow } from "./types";
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
  const [filter, setFilter] = useState("all"),
    [q, setQ] = useState("");
  const shown = chats
    .filter((c) =>
      filter === "all" || filter === "owner"
        ? filter === "all" || isOwnAgentChat(ctx, c)
        : filter === "task"
          ? c.kind === "agent" && c.type !== "channel"
          : c.type === "channel",
    )
    .filter(
      (c) =>
        !q.trim() ||
        chatTitle(ctx, c).toLowerCase().includes(q.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(isOwnAgentChat(ctx, b)) - Number(isOwnAgentChat(ctx, a)) ||
        b.last_message_at.localeCompare(a.last_message_at),
    );
  const groups = [
    {
      title: "Your private conversations",
      list: shown.filter((c) => isOwnAgentChat(ctx, c)),
    },
    {
      title: "Agent work",
      list: shown.filter(
        (c) => !isOwnAgentChat(ctx, c) && c.type !== "channel",
      ),
    },
    { title: "Channels", list: shown.filter((c) => c.type === "channel") },
  ];
  return (
    <section className="list" aria-label="Conversations">
      <div className="list-head">
        <div className="brand">
          <h1>Conversations</h1>
        </div>
        <small className="list-subtitle">{subtitle}</small>
        <label className="search">
          <Icon.search />
          <Input
            type="search"
            placeholder="Find a conversation"
            aria-label="Search chats"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(String(value))}
        >
          <TabsList className="h-10 w-full" aria-label="Filter chats">
            {[
              ["all", "All"],
              ["owner", "Private"],
              ["task", "Work"],
              ["channel", "Channels"],
            ].map(([id, label]) => (
              <TabsTrigger key={id} value={id}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div
        className="items"
        onKeyDown={(e) => {
          if (
            e.altKey ||
            e.ctrlKey ||
            e.metaKey ||
            !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
          )
            return;
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>("button.item"),
          );
          const index = items.indexOf(e.target as HTMLButtonElement);
          if (index < 0) return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? items.length - 1
                : Math.max(
                    0,
                    Math.min(
                      items.length - 1,
                      index + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  );
          items[next]?.focus();
        }}
      >
        {groups.map((g) =>
          g.list.length ? (
            <div className="conversation-group" key={g.title}>
              <h2>{g.title}</h2>
              {g.list.map((c) => {
                const peer = chatPeer(ctx, c),
                  p = previewOf(ctx, c),
                  n = unread[c.id] ?? 0;
                return (
                  <Button
                    key={c.id}
                    className="item"
                    aria-current={active === c.id ? "true" : undefined}
                    onClick={() => onOpen(c.id)}
                  >
                    <ChatAvatar type={c.type} agent={peer} />
                    <div className="item-body">
                      <div className="top">
                        <span className="name">{chatTitle(ctx, c)}</span>
                        {peer?.verified ? <Verified /> : null}
                      </div>
                      <div className="prev">
                        {p.who ? <b>{p.who}: </b> : null}
                        {p.text}
                      </div>
                      {(c.type === "task" && c.status !== "open") ||
                      c.frozen ||
                      c.request_state === "pending" ? (
                        <div className="item-status">
                          {c.type === "task" && c.status !== "open" ? (
                            <StatusPill status={c.status} />
                          ) : null}
                          {c.frozen ? (
                            <span className="pill muted">Read-only</span>
                          ) : c.request_state === "pending" ? (
                            <span className="pill waiting">Request</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="meta">
                      <span>{fmtListTime(c.last_message_at)}</span>
                      {n ? <span className="badge">{n}</span> : null}
                    </div>
                  </Button>
                );
              })}
            </div>
          ) : null,
        )}
        {!shown.length ? (
          <div className="list-empty">
            {chats.length
              ? "No conversations match."
              : "Give your assistant a goal to get started."}
          </div>
        ) : null}
      </div>
    </section>
  );
}
