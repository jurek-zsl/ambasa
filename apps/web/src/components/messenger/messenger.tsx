"use client";
import { toast as notifications } from "@/components/ui/toast";
import { Button } from "@/components/app-ui";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
import { isOwnAgentChat, membersOf, type ChatCtx } from "./chat-helpers";
import { HumanAvatar } from "./avatar";
import { ChatList } from "./chat-list";
import { createComposerStore } from "./composer-files";
import { ChatView } from "./chat-view";
import { Icon, Mark } from "./icons";
import { InfoPanel } from "./info-panel";
import type { View } from "./types";
import { useMessenger } from "./use-messenger";
import { AnalyticsView, ChannelsView, SettingsView } from "./more-views";
import { Onboarding } from "./onboarding";
import { Palette } from "./palette";
import { AgentsView, ApprovalsView, ExploreView } from "./views";
import { TasksView } from "./workspace";
import { ReadinessPanel } from "./readiness";
import { UsageDetails } from "./usage-details";
const VIEWS: View[] = [
  "chats",
  "tasks",
  "approvals",
  "explore",
  "channels",
  "agents",
  "analytics",
  "settings",
  "more",
];
export function MessengerApp() {
  const router = useRouter();
  const [user, setUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const sb = browserClient();
    sb.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (error || !data.user) return router.replace("/login");
        const { data: profile } = await sb
          .from("profiles")
          .select("display_name")
          .eq("id", data.user.id)
          .maybeSingle();
        setUser({
          id: data.user.id,
          name: profile?.display_name || data.user.email || "You",
        });
      })
      .catch(() =>
        setError("Could not open Ambasa. Check your connection and reload."),
      );
    const { data: sub } = sb.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_OUT") router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);
  if (!user)
    return (
      <div className="center">
        <div className="opening">
          <Mark />
          <p role="status">{error || "Opening Ambasa…"}</p>
          {error ? (
            <Button
              className="btn sec"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          ) : null}
        </div>
      </div>
    );
  return <Messenger userId={user.id} userName={user.name} />;
}
function Messenger({ userId, userName }: { userId: string; userName: string }) {
  const data = useMessenger(userId);
  const composerStore = useMemo(() => createComposerStore(), []);
  useEffect(() => () => composerStore.dispose(), [composerStore]);
  const [view, setView] = useState<View>("tasks");
  const [active, setActive] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [setupAgent, setSetupAgent] = useState<string | undefined>();
  const initialized = useRef(false);
  // Drafts survive navigation, stay in memory, and disappear when the workspace closes.
  const drafts = useRef<Record<string, { message: string; guidance: string }>>(
    {},
  );
  const readDraft = useCallback(
    (id: string) => drafts.current[id] ?? { message: "", guidance: "" },
    [],
  );
  const writeDraft = useCallback(
    (id: string, field: "message" | "guidance", value: string) => {
      const previous = drafts.current[id] ?? { message: "", guidance: "" };
      drafts.current[id] = { ...previous, [field]: value };
    },
    [],
  );
  const toast = useCallback((text: string) => {
    notifications.add({ title: text });
  }, []);
  const ctx: ChatCtx = useMemo(
    () => ({
      userId,
      userName,
      agents: data.agents,
      myAgentIds: data.myAgentIds,
      members: data.members,
    }),
    [userId, userName, data.agents, data.myAgentIds, data.members],
  );
  const { open } = data;
  const navigate = useCallback(
    (next: View, id?: string, replace = false) => {
      setView(next);
      setActive(id ?? null);
      setShowChat(!!id);
      setInfoOpen(false);
      open(id ?? null);
      const params = new URLSearchParams();
      params.set("view", next);
      if (id) params.set("chat", id);
      window.history[replace ? "replaceState" : "pushState"](
        null,
        "",
        `/app?${params}`,
      );
    },
    [open],
  );
  const openChat = useCallback(
    (id: string) => navigate("chats", id),
    [navigate],
  );
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const v = p.get("view") as View | null;
      const id = p.get("chat");
      setView(id ? "chats" : v && VIEWS.includes(v) ? v : "tasks");
      setActive(id);
      setShowChat(!!id);
      setInfoOpen(false);
      open(id);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [open]);
  const myAgents = [...data.agents.values()].filter((a) =>
    data.myAgentIds.has(a.id),
  );
  const main = myAgents.find((a) => a.isMain) ?? myAgents[0];
  const ownChatFor = useCallback(
    (id: string) =>
      data.chats.find(
        (c) =>
          isOwnAgentChat(ctx, c) && membersOf(ctx, c.id)[0]?.agent_id === id,
      )?.id,
    [ctx, data.chats],
  );
  const assistant = () => {
    const id = main && ownChatFor(main.id);
    if (id) openChat(id);
    else navigate("agents");
  };
  const setup = (id?: string) => {
    setSetupAgent(id);
    navigate("agents");
  };
  useEffect(() => {
    if (!data.loaded || initialized.current) return;
    initialized.current = true;
    if (!window.location.search && data.settings?.ui_mode === "simple") {
      const main = [...data.agents.values()].find(
        (a) => a.isMain && a.ownerId === userId,
      );
      const chat =
        main &&
        data.chats.find(
          (c) =>
            c.kind === "owner" &&
            data.members.some(
              (m) => m.chat_id === c.id && m.agent_id === main.id,
            ),
        );
      if (chat) {
        // Initial browser-only landing preference after the profile loads.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        navigate("chats", chat.id, true);
      }
    }
  }, [
    data.loaded,
    data.settings,
    data.agents,
    data.chats,
    data.members,
    userId,
    navigate,
  ]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (e.repeat) return;
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const chat = data.chats.find((c) => c.id === active);
  const pending =
    data.approvals.filter((a) => a.owner_id === userId && a.state === "pending")
      .length +
    data.chats.filter(
      (c) =>
        c.request_state === "pending" &&
        c.request_to &&
        data.myAgentIds.has(c.request_to),
    ).length;
  const rail: {
    id: View;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: "chats", label: "Assistant", icon: <Icon.chats /> },
    { id: "tasks", label: "Tasks", icon: <Icon.task /> },
    {
      id: "approvals",
      label: "Approvals",
      icon: <Icon.shield />,
      badge: pending,
    },
    { id: "explore", label: "Discover", icon: <Icon.compass /> },
    { id: "channels", label: "Channels", icon: <Icon.chats /> },
    { id: "agents", label: "My agents", icon: <Icon.chip /> },
    { id: "analytics", label: "Usage", icon: <Icon.eye /> },
    { id: "settings", label: "Settings", icon: <Icon.settings /> },
  ];
  const primary = ["chats", "tasks", "approvals", "explore"];
  return (
    <div className="shell">
      <div
        className={`app ${view !== "chats" ? "full" : infoOpen && chat ? "info-open" : ""} ${showChat ? "show-chat" : ""}`}
      >
        <nav className="side" aria-label="Main">
          <Button
            className="side-brand"
            onClick={() => navigate("tasks")}
            aria-label="Ambasa home"
          >
            <Mark />
          </Button>
          <div className="side-nav">
            {rail.map((r) => (
              <Button
                key={r.id}
                className={`nav-btn ${primary.includes(r.id) ? "nav-primary" : "nav-secondary"}`}
                title={r.label}
                aria-label={r.label}
                aria-current={
                  (r.id === "tasks" &&
                    view === "chats" &&
                    chat?.kind === "agent" &&
                    chat.type !== "channel") ||
                  (view === r.id &&
                    (r.id !== "chats" || !chat || chat.kind === "owner"))
                    ? "page"
                    : undefined
                }
                onClick={() =>
                  r.id === "chats" ? assistant() : navigate(r.id)
                }
              >
                {r.icon}
                <span className="nav-label">{r.label}</span>
                {r.badge ? <span className="badge warn">{r.badge}</span> : null}
              </Button>
            ))}
            <Button
              className="nav-btn nav-more"
              aria-label="More"
              aria-current={!primary.includes(view) ? "page" : undefined}
              onClick={() => navigate("more")}
            >
              <Icon.more />
              <span className="nav-label">More</span>
            </Button>
          </div>
          <div className="side-spacer" />
          <Button
            className="palette-trigger"
            onClick={() => setPaletteOpen(true)}
          >
            <Icon.search />
            <span>Search anything</span>
            <kbd>⌘K</kbd>
          </Button>
          <div className="side-foot">
            <div className="side-user">
              <HumanAvatar name={userName} size="sm" />
              <div className="who-me">
                <b>{userName}</b>
                <small>
                  <span className={`live-dot ${data.live ? "on" : ""}`} />
                  {data.live ? "Connected" : "Reconnecting…"}
                </small>
              </div>
            </div>
            <Button
              className="icon-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={() =>
                data.actions
                  .signOut()
                  .catch(() => toast("Could not sign out. Try again."))
              }
            >
              <Icon.logout />
            </Button>
          </div>
        </nav>
        {data.loadError ? (
          <div className="workspace-error" role="alert">
            {data.loadError}
            <Button
              className="btn sec sm"
              onClick={() => data.actions.refresh()}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {view === "chats" ? (
          <>
            <ChatList
              ctx={ctx}
              chats={data.chats}
              unread={data.unread}
              active={active}
              subtitle="Your agents and their work"
              onOpen={openChat}
            />
            {chat ? (
              <div className="conversation-workspace">
                {isOwnAgentChat(ctx, chat) && main ? (
                  <ReadinessPanel
                    agent={
                      data.agents.get(
                        membersOf(ctx, chat.id)[0]?.agent_id ?? "",
                      ) ?? main
                    }
                    actions={data.actions}
                    compact
                    onSetup={() => setup(membersOf(ctx, chat.id)[0]?.agent_id)}
                  />
                ) : null}
                <ChatView
                  key={chat.id}
                  composerStore={composerStore}
                  readDraft={readDraft}
                  writeDraft={writeDraft}
                  ctx={ctx}
                  chat={chat}
                  messages={data.messages[chat.id]}
                  approvals={data.approvals}
                  infoOpen={infoOpen}
                  onToggleInfo={() => setInfoOpen((o) => !o)}
                  onBack={() => navigate("chats")}
                  onDecide={data.actions.decide}
                  onSend={(text, attachmentIds, clientId) =>
                    data.actions.sendAsOwner(
                      chat.id,
                      text,
                      attachmentIds,
                      clientId,
                    )
                  }
                  onControl={(a) => data.actions.control(chat.id, a)}
                  onRedirect={(text) => data.actions.redirect(chat.id, text)}
                  onAnswerRequest={(d) =>
                    data.actions.answerRequest(chat.id, d)
                  }
                  reactions={data.reactions[chat.id] ?? []}
                  onReact={(id, emoji) =>
                    data.actions.react(id, chat.id, emoji)
                  }
                  onReport={data.actions.report}
                  toast={toast}
                  onOpenChat={openChat}
                  onSetup={setup}
                  actions={data.actions}
                  reading={data.workspace.reading.find(
                    (r) => r.chat_id === chat.id,
                  )}
                />
              </div>
            ) : (
              <section className="chat empty-chat">
                <Mark />
                <h2>Your private line to your agents</h2>
                <p>Choose a conversation, or give your assistant a new goal.</p>
                <Button className="btn pri" onClick={assistant}>
                  Open assistant
                </Button>
              </section>
            )}
            {chat && infoOpen ? (
              <InfoPanel
                ctx={ctx}
                chat={chat}
                approvals={data.approvals}
                rules={data.rules}
                actions={data.actions}
                onClose={() => setInfoOpen(false)}
              />
            ) : null}
          </>
        ) : null}
        {view === "tasks" ? (
          <TasksView
            ctx={ctx}
            chats={data.chats}
            approvals={data.approvals}
            workspace={data.workspace}
            onOpen={openChat}
            onAssistant={assistant}
            onSetup={() => setup()}
            actions={data.actions}
            toast={toast}
          />
        ) : null}
        {view === "approvals" ? (
          <ApprovalsView
            ctx={ctx}
            approvals={data.approvals}
            chats={data.chats}
            onOpen={openChat}
            onDecide={data.actions.decide}
            toast={toast}
          />
        ) : null}
        {view === "explore" ? (
          <ExploreView
            ctx={ctx}
            toast={toast}
            onConnect={async (id, handle, goal) =>
              openChat(await data.actions.connect(id, handle, goal))
            }
          />
        ) : null}
        {view === "agents" ? (
          <AgentsView
            key={setupAgent ?? "agents"}
            initialAgentId={setupAgent}
            ctx={ctx}
            rules={data.rules}
            actions={data.actions}
            toast={toast}
            onOpenChat={openChat}
            ownChatFor={ownChatFor}
            grants={data.grants}
            links={data.links}
            usage={data.usage}
          />
        ) : null}
        {view === "channels" ? (
          <ChannelsView
            ctx={ctx}
            ideas={data.ideas}
            channels={data.channels}
            chats={data.chats}
            actions={data.actions}
            toast={toast}
            onOpen={openChat}
            reading={data.workspace.reading}
            previews={data.workspace.previews}
          />
        ) : null}
        {view === "analytics" ? (
          <div className="view" aria-label="Usage">
            <div className="view-in">
              <AnalyticsView ctx={ctx} actions={data.actions} />
              <UsageDetails workspace={data.workspace} actions={data.actions} />
            </div>
          </div>
        ) : null}
        {view === "settings" ? (
          <SettingsView
            settings={data.settings}
            actions={data.actions}
            toast={toast}
          />
        ) : null}
        {view === "more" ? (
          <section className="view" aria-label="More">
            <div className="view-in">
              <div className="view-head">
                <h1>More</h1>
                <p>Manage your workspace.</p>
              </div>
              <div className="more-menu">
                {rail
                  .filter((r) => !primary.includes(r.id))
                  .map((r) => (
                    <Button key={r.id} onClick={() => navigate(r.id)}>
                      {r.icon}
                      <span>{r.label}</span>
                      <Icon.open />
                    </Button>
                  ))}
                <Button
                  onClick={() =>
                    data.actions
                      .signOut()
                      .catch(() => toast("Could not sign out."))
                  }
                >
                  <Icon.logout />
                  <span>Sign out</span>
                </Button>
              </div>
            </div>
          </section>
        ) : null}
        {data.loaded &&
        data.settings &&
        !data.settings.onboarded &&
        !myAgents.length ? (
          <Onboarding
            actions={data.actions}
            toast={toast}
            onDone={(id) => (id ? openChat(id) : setup())}
          />
        ) : null}
        {paletteOpen ? (
          <Palette
            ctx={ctx}
            chats={data.chats}
            actions={data.actions}
            go={(v) => (v === "chats" ? assistant() : navigate(v))}
            onSetup={setup}
            openChat={openChat}
            onClose={() => setPaletteOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
