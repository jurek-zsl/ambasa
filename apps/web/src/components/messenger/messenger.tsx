"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
import { isOwnAgentChat, membersOf, type ChatCtx } from "./chat-helpers";
import { HumanAvatar } from "./avatar";
import { ChatList } from "./chat-list";
import { ChatView } from "./chat-view";
import { Icon, Mark } from "./icons";
import { InfoPanel } from "./info-panel";
import type { View } from "./types";
import { useMessenger } from "./use-messenger";
import { AgentsView, ApprovalsView, ExploreView } from "./views";

export function MessengerApp() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const sb = browserClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace("/login");
      const { data: profile } = await sb.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
      setUser({ id: data.user.id, name: profile?.display_name || data.user.email || "You" });
    });
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!user) {
    return (
      <div className="center">
        <div style={{ display: "grid", justifyItems: "center", gap: 12, color: "var(--muted)" }}>
          <Mark />
          Opening ArtiGram…
        </div>
      </div>
    );
  }
  return <Messenger userId={user.id} userName={user.name} />;
}

function Messenger({ userId, userName }: { userId: string; userName: string }) {
  const data = useMessenger(userId);
  const [view, setView] = useState<View>("chats");
  const [active, setActive] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((t: string) => {
    setToastText(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 2600);
  }, []);

  const ctx: ChatCtx = useMemo(
    () => ({ userId, userName, agents: data.agents, myAgentIds: data.myAgentIds, members: data.members }),
    [userId, userName, data.agents, data.myAgentIds, data.members],
  );

  const { open } = data;
  const openChat = useCallback(
    (id: string) => {
      setView("chats");
      setActive(id);
      setShowChat(true);
      open(id);
    },
    [open],
  );

  // Start on the most recent chat on wide screens; collapse details on narrow ones.
  useEffect(() => {
    if (!data.loaded || active || !data.chats.length) return;
    // One-time layout choice that depends on the viewport, so it can't run during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia("(max-width: 1180px)").matches) setInfoOpen(false);
    if (window.matchMedia("(max-width: 720px)").matches) return;
    const waiting = data.chats.find((c) => c.status === "waiting");
    const first = waiting ?? data.chats.find((c) => !isOwnAgentChat(ctx, c)) ?? data.chats[0]!;
    setActive(first.id);
    open(first.id);
  }, [data.loaded, data.chats, active, ctx, open]);

  const chat = data.chats.find((c) => c.id === active);
  const pending = data.approvals.filter((a) => a.state === "pending" && a.owner_id === userId).length;
  const unreadTotal = Object.values(data.unread).reduce((s, n) => s + n, 0);
  const myAgents = [...data.agents.values()].filter((a) => data.myAgentIds.has(a.id));
  const subtitle = myAgents.length ? myAgents.map((a) => a.name).join(", ") : "No agents yet";

  const ownChatFor = useCallback(
    (agentId: string) => data.chats.find((c) => isOwnAgentChat(ctx, c) && membersOf(ctx, c.id)[0]?.agent_id === agentId)?.id,
    [data.chats, ctx],
  );

  const railItems: { id: View; label: string; icon: React.ReactNode; badge?: number; warn?: boolean }[] = [
    { id: "chats", label: "Chats", icon: <Icon.chats />, badge: unreadTotal },
    { id: "approvals", label: "Approvals", icon: <Icon.shield />, badge: pending, warn: true },
    { id: "explore", label: "Explore", icon: <Icon.compass /> },
    { id: "agents", label: "My agents", icon: <Icon.chip /> },
  ];

  const cls = ["app", view !== "chats" ? "full" : infoOpen && chat ? "info-open" : "", showChat ? "show-chat" : ""].join(" ");

  return (
    <div className="shell">
      <div className={cls}>
        <nav className="side" aria-label="Main">
          <div className="side-brand">
            <Mark />
            <span>ArtiGram</span>
          </div>
          <div className="side-label">Workspace</div>
          <div className="side-nav">
            {railItems.map((r) => (
              <button
                key={r.id}
                className="nav-btn"
                title={r.label}
                aria-current={view === r.id}
                onClick={() => {
                  setView(r.id);
                  if (r.id !== "chats") setShowChat(false);
                }}
              >
                {r.icon}
                <span className="nav-label">{r.label}</span>
                {r.badge ? <span className={`badge ${r.warn ? "warn" : ""}`}>{r.badge}</span> : null}
              </button>
            ))}
          </div>
          <div className="side-spacer" />
          <div className="side-foot">
            <div className="side-user">
              <HumanAvatar name={userName} size="sm" />
              <div className="who-me">
                <b>{userName}</b>
                <small>
                  <span className={`live-dot ${data.live ? "on" : ""}`} aria-hidden="true" />
                  {data.live ? "Live" : "Connecting"}
                </small>
              </div>
            </div>
            <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => data.actions.signOut()}>
              <Icon.logout />
            </button>
          </div>
        </nav>

        {view === "chats" ? (
          <>
            <ChatList ctx={ctx} chats={data.chats} unread={data.unread} active={active} subtitle={subtitle} onOpen={openChat} />
            {chat ? (
              <ChatView
                ctx={ctx}
                chat={chat}
                messages={data.messages[chat.id]}
                approvals={data.approvals}
                infoOpen={infoOpen}
                onToggleInfo={() => setInfoOpen((o) => !o)}
                onBack={() => {
                  setShowChat(false);
                  setActive(null);
                  open(null);
                }}
                onDecide={data.actions.decide}
                onSend={(text) => data.actions.sendAsOwner(chat.id, text)}
                onTakeOver={(p) => data.actions.takeOver(chat.id, p)}
                toast={toast}
              />
            ) : (
              <section className="chat" aria-label="Conversation">
                <div className="empty-chat">
                  <Mark />
                  {data.loaded ? "Pick a chat to watch your agents work." : "Loading your chats…"}
                </div>
              </section>
            )}
            {chat && infoOpen ? (
              <InfoPanel ctx={ctx} chat={chat} approvals={data.approvals} rules={data.rules} onClose={() => setInfoOpen(false)} />
            ) : null}
          </>
        ) : null}

        {view === "approvals" ? (
          <ApprovalsView ctx={ctx} approvals={data.approvals} chats={data.chats} onOpen={openChat} onDecide={data.actions.decide} toast={toast} />
        ) : null}
        {view === "explore" ? (
          <ExploreView
            ctx={ctx}
            toast={toast}
            onConnect={async (agentId, handle) => {
              const id = await data.actions.connect(agentId, handle);
              openChat(id);
            }}
          />
        ) : null}
        {view === "agents" ? (
          <AgentsView ctx={ctx} rules={data.rules} actions={data.actions} toast={toast} onOpenChat={openChat} ownChatFor={ownChatFor} />
        ) : null}

        {toastText ? (
          <div className="toast" role="status">
            {toastText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
