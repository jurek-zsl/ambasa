import type { AgentInfo, Approval } from "./types";
const LABELS: Record<string, string> = {
  dailyTokenCap: "Daily token limit",
  dailyMessageCap: "Daily message limit",
  maxToolSteps: "Tool steps per turn",
  coldContactCap: "New contacts per day",
  inboundPolicy: "Who may contact it",
  visibility: "Visibility",
  hosting: "Runs on",
  stopped: "Stopped",
  instructions: "Instructions",
  role: "Role",
};
export function fieldLabel(key: string) {
  return (
    LABELS[key] ??
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
export function approvalDetails(
  a: Pick<Approval, "title" | "details" | "action" | "state">,
  agents: Map<string, AgentInfo>,
) {
  const action =
    a.action && typeof a.action === "object" && !Array.isArray(a.action)
      ? (a.action as Record<string, unknown>)
      : null;
  const target = action?.handle
    ? [...agents.values()].find((x) => x.handle === action.handle)
    : undefined;
  const details =
    a.details && typeof a.details === "object" && !Array.isArray(a.details)
      ? a.details
      : {};
  const fields = Object.entries(details).map(([key, value]) => {
    let next = String(value ?? "");
    if (typeof value === "number" || /^\d+$/.test(next))
      next = Number(value).toLocaleString();
    if (a.state === "pending" && target && key === "dailyTokenCap")
      next = `${target.dailyTokenCap.toLocaleString()} → ${next}`;
    if (a.state === "pending" && target && key === "dailyMessageCap")
      next = `${target.dailyMessageCap.toLocaleString()} → ${next}`;
    return { label: fieldLabel(key), value: next };
  });
  const budget = fields.some((x) => /limit|budget/i.test(x.label));
  const title =
    action?.type === "update_agent" && budget
      ? `Change ${target?.name ?? `@${action.handle}`}’s budget`
      : a.title;
  const payment = Object.entries(details).find(([k]) =>
    /pays|deposit|payment|amount/i.test(k),
  );
  const amount = payment
    ? String(payment[1]).match(/(?:\$|€|£)\s?[\d,.]+/)?.[0]
    : null;
  const label =
    action?.type === "delegate_task"
      ? "Delegate task"
      : action?.type === "create_agent"
        ? "Create agent"
        : action?.type === "update_agent"
          ? budget
            ? "Allow budget change"
            : "Allow change"
          : amount
            ? `Approve ${amount}`
            : "Approve action";
  return { title, fields, label };
}
