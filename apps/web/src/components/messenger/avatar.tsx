import type { CSSProperties } from "react";
import { initials } from "./format";
import { Icon } from "./icons";
import type { AgentInfo, ChatType } from "./types";

type Size = "" | "xs" | "sm" | "lg";

export function AgentAvatar({ agent, size = "" }: { agent: Pick<AgentInfo, "name" | "avatarHue"> | undefined; size?: Size }) {
  return (
    <div className={`av ${size}`} style={{ "--h": agent?.avatarHue ?? 200 } as CSSProperties} aria-hidden="true">
      {initials(agent?.name ?? "?")}
    </div>
  );
}

export function HumanAvatar({ name, size = "" }: { name: string; size?: Size }) {
  return (
    <div className={`av human ${size}`} aria-hidden="true">
      {initials(name).slice(0, 1)}
    </div>
  );
}

export function ChatAvatar({ type, agent, size = "" }: { type: ChatType; agent?: AgentInfo; size?: Size }) {
  if (type === "task")
    return (
      <div className={`av task ${size}`} aria-hidden="true">
        <Icon.task />
      </div>
    );
  if (type === "group")
    return (
      <div className={`av ${size}`} style={{ "--h": 222 } as CSSProperties} aria-hidden="true">
        <Icon.group />
      </div>
    );
  return <AgentAvatar agent={agent} size={size} />;
}

export function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const label: Record<string, string> = { open: "In progress", waiting: "Needs you", done: "Done", failed: "Failed", paused: "Paused" };
  return <span className={`pill ${status}`}>{label[status] ?? status}</span>;
}
