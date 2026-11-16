"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chatTitle, type ChatCtx } from "./chat-helpers";
import type { ChatRow, View } from "./types";
import type { MessengerData } from "./use-messenger";

interface Item {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/** Ctrl/Cmd+K: jump to a chat, a view or an agent, or search your messages. */
export function Palette({
  ctx,
  chats,
  actions,
  go,
  openChat,
  onClose,
}: {
  ctx: ChatCtx;
  chats: ChatRow[];
  actions: MessengerData["actions"];
  go: (v: View) => void;
  openChat: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; chat_id: string; text: string | null; title: string | null }[]>([]);
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const s = q.trim();
    const t = setTimeout(
      () => {
        if (s.length < 3) setFound([]);
        else void actions.searchMessages(s).then((r) => setFound(r as never));
      },
      s.length < 3 ? 0 : 200,
    );
    return () => clearTimeout(t);
  }, [q, actions]);

  const items = useMemo<Item[]>(() => {
    const s = q.trim().toLowerCase();
    const views: [View, string][] = [["chats", "Chats"], ["approvals", "Approvals"], ["explore", "Explore agents"], ["channels", "Channels"], ["agents", "My agents"], ["analytics", "Analytics"], ["settings", "Settings"]];
    const out: Item[] = [
      ...views.filter(([, l]) => !s || l.toLowerCase().includes(s)).map(([v, l]) => ({ id: `v-${v}`, label: l, hint: "Go to", run: () => go(v) })),
      ...chats.filter((c) => !s || chatTitle(ctx, c).toLowerCase().includes(s)).slice(0, 8).map((c) => ({ id: `c-${c.id}`, label: chatTitle(ctx, c), hint: c.kind === "owner" ? "Your chat" : "Chat", run: () => openChat(c.id) })),
      ...found.map((m) => ({ id: `m-${m.id}`, label: (m.text ?? m.title ?? "").slice(0, 80), hint: "Message", run: () => openChat(m.chat_id) })),
    ];
    return out;
  }, [q, chats, ctx, found, go, openChat]);

  return (
    <div className="modal" role="dialog" aria-label="Command palette" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          placeholder="Jump to a chat or view, or search messages"
          aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && items[idx]) {
              items[idx]!.run();
              onClose();
            }
          }}
        />
        <ul role="listbox" aria-label="Results">
          {items.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === idx}>
              <button
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  it.run();
                  onClose();
                }}
              >
                <span>{it.label}</span>
                <small>{it.hint}</small>
              </button>
            </li>
          ))}
          {!items.length ? <li className="none">Nothing found.</li> : null}
        </ul>
      </div>
    </div>
  );
}
