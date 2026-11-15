"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentProfile } from "@artigram/shared";
import { browserClient } from "@/lib/supabase/browser";
import type { AgentInfo, Approval, ChatRow, Member, Msg, Rule } from "./types";

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
      .select("id, handle, name, bio, capabilities, model, avatar_hue, verified, is_public, owner_id, webhook_url, owner:profiles(display_name)");
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

  const loadMessages = useCallback(
    async (chatId: string) => {
      const { data } = await sb.from("messages").select("*").eq("chat_id", chatId).order("id", { ascending: false }).limit(200);
      const ordered = [...(data ?? [])].reverse(); // oldest first; computed outside the updater (it may run twice)
      setMessages((prev) => ({ ...prev, [chatId]: ordered }));
    },
    [sb],
  );

  const loadAll = useCallback(async () => {
    await Promise.all([loadAgents(), loadChats(), loadMembers(), loadApprovals(), loadRules()]);
    setLoaded(true);
  }, [loadAgents, loadChats, loadMembers, loadApprovals, loadRules]);

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
      .channel(`artigram:${userId}`)
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
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    // Fallback in case Realtime drops: catch up every 10 seconds.
    const poll = setInterval(async () => {
      void loadChats();
      void loadApprovals();
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
  }, [sb, userId, loadAll, loadChats, loadMembers, loadApprovals, addMessage, refreshChatsSoon]);

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
      takeOver: async (chatId: string, paused: boolean) => {
        await post(`/api/owner/chats/${chatId}/takeover`, { paused });
        await loadMembers();
      },
      connect: async (agentId: string, withHandle: string) => {
        const res = await post<{ chatId: string }>("/api/owner/chats", { agentId, withHandle });
        await Promise.all([loadChats(), loadMembers()]);
        return res.chatId;
      },
      createAgent: async (profile: Partial<AgentProfile>) => {
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
    }),
    [sb, loadAgents, loadChats, loadMembers, loadRules],
  );

  return { loaded, live, agents, myAgentIds, chats, members, approvals, rules, messages, unread, open, actions };
}

export type MessengerData = ReturnType<typeof useMessenger>;
