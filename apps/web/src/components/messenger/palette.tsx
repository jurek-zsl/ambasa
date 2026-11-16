"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, Input } from "@/components/app-ui";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { chatTitle, type ChatCtx } from "./chat-helpers";
import type { ChatRow, View } from "./types";
import type { MessengerData } from "./use-messenger";

type Match = Awaited<
  ReturnType<MessengerData["actions"]["searchMessages"]>
>[number];
const EMPTY_MATCHES: Match[] = [];
interface Item {
  id: string;
  label: string;
  hint: string;
  group: "Navigation" | "Conversations" | "Agents" | "Messages";
  icon: ReactNode;
  run: () => void;
}

/** One focused input owns keyboard navigation; Base UI owns modal focus and dismissal. */
export function Palette({
  ctx,
  chats,
  actions,
  go,
  openChat,
  onSetup,
  onClose,
}: {
  ctx: ChatCtx;
  chats: ChatRow[];
  actions: MessengerData["actions"];
  go: (view: View) => void;
  openChat: (id: string) => void;
  onSetup: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState<{
    query: string;
    rows: Match[];
    pending: boolean;
    error: boolean;
  }>({ query: "", rows: [], pending: false, error: false });
  const input = useRef<HTMLInputElement>(null);
  const resultList = useRef<HTMLDivElement>(null);
  const id = useId();
  const term = query.trim();

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    if (term.length < 3) return;
    let current = true;
    const timer = setTimeout(() => {
      setSearch({ query: term, rows: [], pending: true, error: false });
      void actions
        .searchMessages(term)
        .then((rows) => {
          if (current)
            setSearch({ query: term, rows, pending: false, error: false });
        })
        .catch(() => {
          if (current)
            setSearch({ query: term, rows: [], pending: false, error: true });
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, actions, retry]);

  const matches =
    term.length >= 3 && search.query === term ? search.rows : EMPTY_MATCHES;
  const pending = term.length >= 3 && (search.query !== term || search.pending);
  const failed = term.length >= 3 && search.query === term && search.error;
  const items = useMemo<Item[]>(() => {
    const q = term.toLowerCase();
    const destinations: {
      view: View;
      label: string;
      aliases: string;
      icon: ReactNode;
    }[] = [
      {
        view: "chats",
        label: "Assistant",
        aliases: "main private chat",
        icon: <Icon.chats />,
      },
      {
        view: "tasks",
        label: "Tasks",
        aliases: "work presets schedules",
        icon: <Icon.task />,
      },
      {
        view: "approvals",
        label: "Approvals",
        aliases: "decisions permissions",
        icon: <Icon.shield />,
      },
      {
        view: "explore",
        label: "Discover",
        aliases: "explore find agents",
        icon: <Icon.compass />,
      },
      {
        view: "channels",
        label: "Channels",
        aliases: "posts reading saved",
        icon: <Icon.group />,
      },
      {
        view: "agents",
        label: "My agents",
        aliases: "models providers keys setup",
        icon: <Icon.chip />,
      },
      {
        view: "analytics",
        label: "Usage",
        aliases: "analytics tokens budget costs",
        icon: <Icon.eye />,
      },
      {
        view: "settings",
        label: "Settings",
        aliases: "preferences appearance notifications",
        icon: <Icon.settings />,
      },
    ];
    return [
      ...destinations
        .filter(
          (d) => !q || `${d.label} ${d.aliases}`.toLowerCase().includes(q),
        )
        .map((d): Item => ({
          id: `view-${d.view}`,
          label: d.label,
          hint: "Open",
          group: "Navigation",
          icon: d.icon,
          run: () => go(d.view),
        })),
      ...[...chats]
        .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
        .filter((chat) => !q || chatTitle(ctx, chat).toLowerCase().includes(q))
        .slice(0, q ? 12 : 5)
        .map((chat): Item => ({
          id: `chat-${chat.id}`,
          label: chatTitle(ctx, chat),
          hint:
            chat.kind === "owner"
              ? "Private chat"
              : chat.type === "channel"
                ? "Channel"
                : "Agent conversation",
          group: "Conversations",
          icon: <Icon.chats />,
          run: () => openChat(chat.id),
        })),
      ...(q
        ? [...ctx.agents.values()]
            .filter(
              (a) =>
                ctx.myAgentIds.has(a.id) &&
                `${a.name} ${a.handle}`.toLowerCase().includes(q),
            )
            .slice(0, 6)
            .map((agent): Item => ({
              id: `agent-${agent.id}`,
              label: agent.name,
              hint: "Agent settings",
              group: "Agents",
              icon: <Icon.chip />,
              run: () => onSetup(agent.id),
            }))
        : []),
      ...matches.map((message): Item => ({
        id: `message-${message.id}`,
        label: (
          message.text?.trim() ||
          message.title?.trim() ||
          "Message"
        ).slice(0, 120),
        hint: chats.some((chat) => chat.id === message.chat_id)
          ? chatTitle(
              ctx,
              chats.find((chat) => chat.id === message.chat_id)!,
            )
          : "Open conversation",
        group: "Messages",
        icon: <Icon.search />,
        run: () => openChat(message.chat_id),
      })),
    ];
  }, [term, chats, ctx, matches, go, openChat, onSetup]);
  const activeIndex = items.length
    ? Math.min(Math.max(index, 0), items.length - 1)
    : -1;
  const activeId =
    activeIndex >= 0 ? `${id}-option-${items[activeIndex]!.id}` : undefined;
  useEffect(() => {
    if (!activeId) return;
    const selected = resultList.current?.querySelector<HTMLElement>(
      `[id="${activeId}"]`,
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [activeId]);
  function choose(item: Item) {
    onClose();
    item.run();
  }

  return (
    <Dialog
      title="Command palette"
      onClose={onClose}
      className="command-dialog"
    >
      <div className="command-palette">
        <div className="command-search">
          <Icon.search />
          <Input
            ref={input}
            value={query}
            placeholder="Search anything…"
            aria-label="Search commands and conversations"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${id}-results`}
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (
                ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
                ((event.key !== "Home" && event.key !== "End") || event.altKey)
              ) {
                event.preventDefault();
                if (!items.length) return;
                if (event.key === "Home") setIndex(0);
                else if (event.key === "End") setIndex(items.length - 1);
                else
                  setIndex(
                    (activeIndex +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                      items.length,
                  );
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (activeIndex >= 0) choose(items[activeIndex]!);
              }
            }}
          />
        </div>
        <div
          className="command-results"
          id={`${id}-results`}
          ref={resultList}
          role="listbox"
          aria-label="Search results"
          aria-busy={pending}
        >
          {(["Navigation", "Conversations", "Agents", "Messages"] as const).map(
            (group) => {
              const rows = items.filter((item) => item.group === group);
              return rows.length ? (
                <div role="group" aria-label={group} key={group}>
                  <div className="command-group" aria-hidden="true">
                    {group === "Conversations" && !term
                      ? "Recent conversations"
                      : group}
                  </div>
                  {rows.map((item) => (
                    <Button
                      type="button"
                      role="option"
                      tabIndex={-1}
                      id={`${id}-option-${item.id}`}
                      key={item.id}
                      aria-selected={activeId === `${id}-option-${item.id}`}
                      className="command-option"
                      onPointerMove={() => setIndex(items.indexOf(item))}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => choose(item)}
                    >
                      {item.icon}
                      <span className="command-label">{item.label}</span>
                      <small>{item.hint}</small>
                      <span className="command-enter" aria-hidden="true">
                        ↵
                      </span>
                    </Button>
                  ))}
                </div>
              ) : null;
            },
          )}
        </div>
        {pending ? (
          <div className="command-status" role="status">
            Searching messages…
          </div>
        ) : null}
        {!items.length && !pending && !failed ? (
          <div className="command-empty" role="status">
            <Icon.search />
            <strong>No results</strong>
            <span>Try a conversation name, a setting, or different words.</span>
          </div>
        ) : null}
        {failed ? (
          <div className="command-status" role="alert">
            Message search couldn’t connect.{" "}
            <Button
              type="button"
              className="command-retry"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <div className="command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>esc</kbd> Close
          </span>
        </div>
      </div>
    </Dialog>
  );
}
