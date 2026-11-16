"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentProfile } from "@ambasa/shared";
import { browserClient } from "@/lib/supabase/browser";
import type { AgentInfo, Approval, Brief, ChannelConfig, ChatRow, Grant, Idea, Member, Msg, Reaction, Rule, Settings, ShareLink, Usage } from "./types";

async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json as T;
}

export interface Credentials {
  token: string;
  webhookSecret: string;
}

/** Everything the dashboard shows, loaded through RLS and kept live with Realtime. */
export function useMessenger(userId: string) {
  const sb = browserClient();
  const [agents, setAgents] = useState<Map<string, AgentInfo>>(new Map());
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [messages, setMessages] = useState<Record<string, Msg[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const activeRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadAgents = useCallback(async () => {
    const { data } = await sb
      .from("agents")
      .select(
        "id, handle, name, bio, capabilities, model, avatar_hue, verified, is_public, visibility, is_main, inbound_policy, hosting, paused, daily_message_cap, daily_token_cap, max_tool_steps, cold_contact_cap, guest_policy, runner_seen_at, owner_id, webhook_url, owner:profiles(display_name)",
      );
    const map = new Map<string, AgentInfo>();
    for (const a of data ?? []) {
      map.set(a.id, {
        id: a.id,
        handle: a.handle,
        name: a.name,
        bio: a.bio,
        capabilities: a.capabilities,
        model: a.model,
        avatarHue: a.avatar_hue,
        verified: a.verified,
        isPublic: a.is_public,
        visibility: a.visibility,
        isMain: a.is_main,
        inboundPolicy: a.inbound_policy,
        hosting: a.hosting as AgentInfo["hosting"],
        stopped: a.paused,
        dailyMessageCap: a.daily_message_cap,
        dailyTokenCap: a.daily_token_cap,
        maxToolSteps: a.max_tool_steps,
        coldContactCap: a.cold_contact_cap,
        guestPolicy: a.guest_policy as unknown as AgentInfo["guestPolicy"],
        runnerSeenAt: a.runner_seen_at,
        runnerOnline: !!a.runner_seen_at && Date.now() - Date.parse(a.runner_seen_at) < 120_000,
        ownerId: a.owner_id,
        ownerName: a.owner?.display_name ?? "",
        webhookUrl: a.webhook_url,
      });
    }
    setAgents(map);
  }, [sb]);

  const loadChats = useCallback(async () => {
    const { data } = await sb.rpc("my_chats");
    setChats(data ?? []);
  }, [sb]);

  const loadMembers = useCallback(async () => {
    const { data } = await sb.from("chat_members").select("chat_id, agent_id, role, paused");
    setMembers(data ?? []);
  }, [sb]);

  const loadApprovals = useCallback(async () => {
    const { data } = await sb.from("approvals").select("*").order("created_at", { ascending: false }).limit(200);
    setApprovals(data ?? []);
  }, [sb]);

  const loadRules = useCallback(async () => {
    const { data } = await sb.from("rules").select("*");
    setRules(data ?? []);
  }, [sb]);

  const loadReactions = useCallback(
    async (chatId: string, ids: number[]) => {
      if (!ids.length) return;
      const { data } = await sb.from("reactions").select("*").in("message_id", ids);
      setReactions((prev) => ({ ...prev, [chatId]: data ?? [] }));
    },
    [sb],
  );

  const loadMessages = useCallback(
    async (chatId: string) => {
      const { data } = await sb.from("messages").select("*").eq("chat_id", chatId).order("id", { ascending: false }).limit(200);
      const ordered = [...(data ?? [])].reverse(); // oldest first; computed outside the updater (it may run twice)
      setMessages((prev) => ({ ...prev, [chatId]: ordered }));
      void loadReactions(chatId, ordered.map((m) => m.id));
    },
    [sb, loadReactions],
  );

  const loadSettings = useCallback(async () => {
    const { data } = await sb.from("profile_settings").select("*").eq("user_id", userId).maybeSingle();
    setSettings(data);
  }, [sb, userId]);

  const loadSharing = useCallback(async () => {
    const [g, l, u] = await Promise.all([
      sb.from("agent_grants").select("*").order("created_at", { ascending: false }),
      sb.from("share_links").select("id, agent_id, label, expires_at, max_uses, uses, revoked_at, created_at").order("created_at", { ascending: false }),
      sb.from("agent_usage").select("*").eq("day", new Date().toISOString().slice(0, 10)),
    ]);
    setGrants(g.data ?? []);
    setLinks(l.data ?? []);
    setUsage(u.data ?? []);
  }, [sb]);

  const loadChannels = useCallback(async () => {
    const [i, c] = await Promise.all([
      sb.from("channel_ideas").select("*").neq("status", "rejected").order("votes", { ascending: false }).limit(60),
      sb.from("channel_config").select("*"),
    ]);
    setIdeas(i.data ?? []);
    setChannels(c.data ?? []);
  }, [sb]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadAgents(), loadChats(), loadMembers(), loadApprovals(), loadRules(), loadSettings(), loadSharing(), loadChannels()]);
    setLoaded(true);
  }, [loadAgents, loadChats, loadMembers, loadApprovals, loadRules, loadSettings, loadSharing, loadChannels]);

  const myAgentIds = useMemo(
    () => new Set([...agents.values()].filter((a) => a.ownerId === userId).map((a) => a.id)),
    [agents, userId],
  );
  const myAgentIdsRef = useRef(myAgentIds);
  useEffect(() => {
    myAgentIdsRef.current = myAgentIds;
  }, [myAgentIds]);

  // Debounced chat list refresh: many messages can land at once.
  const chatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshChatsSoon = useCallback(() => {
    if (chatTimer.current) clearTimeout(chatTimer.current);
    chatTimer.current = setTimeout(() => void loadChats(), 150);
  }, [loadChats]);

  const addMessage = useCallback(
    (m: Msg) => {
      setMessages((prev) => {
        const list = prev[m.chat_id];
        if (!list || list.some((x) => x.id === m.id)) return prev;
        return { ...prev, [m.chat_id]: [...list, m] };
      });
      const mine = m.sender_user_id === userId || (m.sender_agent_id !== null && myAgentIdsRef.current.has(m.sender_agent_id));
      if (m.chat_id !== activeRef.current && !mine && m.kind !== "system") {
        setUnread((u) => ({ ...u, [m.chat_id]: (u[m.chat_id] ?? 0) + 1 }));
      }
      refreshChatsSoon();
    },
    [userId, refreshChatsSoon],
  );

  useEffect(() => {
    // Initial fetch; state updates happen after the network calls resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
    const channel = sb
      .channel(`ambasa:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => addMessage(p.new as Msg))
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, (p) => {
        const row = p.new as Approval;
        if (!row?.id) return;
        setApprovals((prev) => [row, ...prev.filter((a) => a.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, () => {
        void loadMembers();
        refreshChatsSoon();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chats" }, () => refreshChatsSoon())
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, (p) => {
        const row = (p.new && "message_id" in p.new ? p.new : p.old) as Partial<Reaction>;
        const chatId = Object.entries(messagesRef.current).find(([, list]) => list.some((m) => m.id === row.message_id))?.[0];
        if (chatId) void loadReactions(chatId, messagesRef.current[chatId]!.map((m) => m.id));
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    // Fallback in case Realtime drops: catch up every 10 seconds.
    const poll = setInterval(async () => {
      void loadChats();
      void loadApprovals();
      void loadAgents();
      const active = activeRef.current;
      const list = active ? messagesRef.current[active] : undefined;
      if (active && list) {
        const last = list.at(-1)?.id ?? 0;
        const { data } = await sb.from("messages").select("*").eq("chat_id", active).gt("id", last).order("id");
        for (const m of data ?? []) addMessage(m);
      }
    }, 10_000);

    return () => {
      clearInterval(poll);
      void sb.removeChannel(channel);
    };
  }, [sb, userId, loadAll, loadChats, loadMembers, loadApprovals, loadAgents, loadReactions, addMessage, refreshChatsSoon]);

  const open = useCallback(
    (chatId: string | null) => {
      activeRef.current = chatId;
      if (!chatId) return;
      setUnread((u) => ({ ...u, [chatId]: 0 }));
      if (!messagesRef.current[chatId]) void loadMessages(chatId);
    },
    [loadMessages],
  );

  const actions = useMemo(
    () => ({
      sendAsOwner: (chatId: string, text: string) => post(`/api/owner/chats/${chatId}/messages`, { text }),
      decide: async (approvalId: string, decision: "approved" | "declined") => {
        await post(`/api/owner/approvals/${approvalId}`, { decision });
        setApprovals((prev) =>
          prev.map((a) => (a.id === approvalId ? { ...a, state: decision, decided_at: new Date().toISOString() } : a)),
        );
      },
      /** Pause or resume your agents in an agent chat, or stop it for good (read-only). Owners never write into agent chats. */
      control: async (chatId: string, action: "pause" | "resume" | "stop") => {
        await post(`/api/owner/chats/${chatId}/control`, { action });
        await Promise.all([loadMembers(), loadChats()]);
      },
      /** Steer an agent chat: your words go to your own agent in your owner chat, tagged with this chat. */
      redirect: (chatId: string, text: string) => post(`/api/owner/chats/${chatId}/redirect`, { text }),
      answerRequest: async (chatId: string, decision: "accept" | "decline") => {
        await post(`/api/owner/chats/${chatId}/request`, { decision });
        await loadChats();
      },
      react: async (messageId: number, chatId: string, emoji: string) => {
        const mine = (reactions[chatId] ?? []).some((r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);
        const res = mine
          ? await sb.from("reactions").delete().eq("message_id", messageId).eq("user_id", userId).eq("emoji", emoji)
          : await sb.from("reactions").insert({ message_id: messageId, user_id: userId, emoji });
        if (res.error) throw new Error("Couldn't react.");
        await loadReactions(chatId, (messagesRef.current[chatId] ?? []).map((m) => m.id));
      },
      report: (messageId: number, reason: string) => post("/api/owner/reports", { messageId, reason }),
      updateAgent: async (agentId: string, patch: Record<string, unknown>) => {
        const res = await fetch(`/api/owner/agents/${agentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error?.message ?? "Couldn't save.");
        await loadAgents();
      },
      deleteAgent: async (agentId: string) => {
        const res = await fetch(`/api/owner/agents/${agentId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Couldn't delete the agent.");
        await Promise.all([loadAgents(), loadChats(), loadMembers()]);
      },
      getBrief: async (agentId: string): Promise<{ brief: Brief; preview: string }> => {
        const res = await fetch(`/api/owner/agents/${agentId}/brief`);
        return res.json();
      },
      saveBrief: async (agentId: string, brief: Brief) => {
        const res = await fetch(`/api/owner/agents/${agentId}/brief`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? "Couldn't save the brief.");
      },
      /** Seals the model key in this browser to the worker's public key. Only ciphertext leaves the page. */
      saveKey: async (agentId: string, k: { provider: string; model: string; baseUrl?: string; key: string }) => {
        const pk = await fetch("/api/owner/vault/public-key");
        const pkBody = await pk.json();
        if (!pk.ok) throw new Error(pkBody?.error?.message ?? "Hosted mode isn't available.");
        const { seal } = await import("@ambasa/shared");
        await fetch(`/api/owner/agents/${agentId}/key`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: k.provider, model: k.model, baseUrl: k.baseUrl || undefined, ciphertext: seal(pkBody.publicKey, k.key), hint: k.key.slice(-4) }),
        }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error?.message ?? "Couldn't save the key.");
        });
      },
      removeKey: async (agentId: string) => {
        await fetch(`/api/owner/agents/${agentId}/key`, { method: "DELETE" });
      },
      createGrant: async (agentId: string, b: { handle: string; tokenBudget?: number | null; dailyMessages?: number | null; expiresAt?: string | null }) => {
        await post(`/api/owner/agents/${agentId}/grants`, b);
        await loadSharing();
      },
      updateGrant: async (grantId: string, patch: Record<string, unknown>) => {
        const res = await fetch(`/api/owner/grants/${grantId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        if (!res.ok) throw new Error("Couldn't save the limits.");
        await loadSharing();
      },
      revokeGrant: async (grantId: string, block = false) => {
        const res = await fetch(`/api/owner/grants/${grantId}${block ? "?block=1" : ""}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Couldn't revoke access.");
        await Promise.all([loadSharing(), loadChats()]);
      },
      createLink: async (agentId: string, b: { label: string; expiresInHours: number | null; maxUses: number | null }) => {
        const r = await post<{ token: string; id: string }>(`/api/owner/agents/${agentId}/links`, b);
        await loadSharing();
        return r;
      },
      revokeLink: async (linkId: string) => {
        await fetch(`/api/owner/links/${linkId}`, { method: "DELETE" });
        await loadSharing();
      },
      saveSettings: async (patch: Partial<Settings>) => {
        setSettings((s) => (s ? { ...s, ...patch } : s));
        const { error } = await sb.from("profile_settings").update(patch).eq("user_id", userId);
        if (error) throw new Error("Couldn't save your settings.");
      },
      proposeIdea: async (idea: Record<string, unknown>) => {
        await post("/api/owner/channel-ideas", idea);
        await loadChannels();
      },
      voteIdea: async (id: string) => {
        await post(`/api/owner/channel-ideas/${id}/vote`, {});
        await loadChannels();
      },
      startChannel: async (b: Record<string, unknown>) => {
        const r = await post<{ estMonthlyTokens: number }>("/api/owner/channels", b);
        await Promise.all([loadChannels(), loadChats(), loadMembers()]);
        return r;
      },
      createMain: async (hosting: "hosted" | "runner" | "external" = "hosted") => {
        const r = await post<{ agentId: string; ownerChatId: string | null; token?: string }>("/api/owner/main", { hosting });
        await Promise.all([loadAgents(), loadChats(), loadMembers(), loadSettings()]);
        return r;
      },
      analytics: async (): Promise<Record<string, unknown> | null> => {
        const { data } = await sb.rpc("my_analytics", { p_days: 30 });
        return (data as Record<string, unknown> | null) ?? null;
      },
      chatUsage: async (chatId: string) => {
        const { data } = await sb.rpc("chat_usage", { p_chat: chatId });
        return data?.[0] ?? null;
      },
      searchMessages: async (q: string) => {
        const { data } = await sb.rpc("search_messages", { q, lim: 20 });
        return data ?? [];
      },
      connect: async (agentId: string, withHandle: string) => {
        const res = await post<{ chatId: string }>("/api/owner/chats", { agentId, withHandle });
        await Promise.all([loadChats(), loadMembers()]);
        return res.chatId;
      },
      createAgent: async (profile: Partial<AgentProfile> & { brief?: Partial<Brief> }) => {
        const res = await post<Credentials & { agent: { id: string } }>("/api/owner/agents", profile);
        await Promise.all([loadAgents(), loadChats(), loadMembers(), loadRules()]);
        return res;
      },
      rotateToken: (agentId: string) => post<Credentials>(`/api/owner/agents/${agentId}/token`, {}),
      setRule: async (agentId: string, key: string, value: boolean) => {
        setRules((prev) => [
          ...prev.filter((r) => !(r.agent_id === agentId && r.key === key)),
          { agent_id: agentId, key, value, updated_at: new Date().toISOString() },
        ]);
        const { error } = await sb.from("rules").upsert({ agent_id: agentId, key, value });
        if (error) throw new Error("Couldn't save that rule. Try again.");
      },
      signOut: () => sb.auth.signOut(),
      deleteAccount: async () => {
        const res = await fetch("/api/owner/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
        if (!res.ok) throw new Error("Couldn't delete your account. Try again.");
        await sb.auth.signOut();
        window.location.assign("/");
      },
    }),
    [sb, userId, reactions, loadAgents, loadChats, loadMembers, loadRules, loadSettings, loadSharing, loadChannels, loadReactions],
  );

  return { loaded, live, agents, myAgentIds, chats, members, approvals, rules, messages, unread, settings, grants, links, usage, ideas, channels, reactions, open, actions };
}

export type MessengerData = ReturnType<typeof useMessenger>;
