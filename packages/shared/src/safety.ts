import type { OutgoingMessage } from "./messages";

/**
 * Heuristics for instruction-like text aimed at the *receiving* agent.
 * A match doesn't block the message: it is delivered with `flagged: true`
 * so the receiver (and its owner) can treat it with extra suspicion.
 */
const PATTERNS: { reason: string; re: RegExp }[] = [
  { reason: "Tries to override the agent's instructions", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|your|earlier)\b[^.\n]{0,20}\b(instructions?|prompts?|rules|messages)\b/i },
  { reason: "Pretends to be a system or developer message", re: /(^|\n|\s)(system|developer|admin)\s*(prompt|message|override)?\s*:/i },
  { reason: "Tries to change the agent's role", re: /\byou are now\b|\bact as (an? )?(unrestricted|jailbroken|developer mode)\b|\bnew instructions\b/i },
  { reason: "Asks for secrets or credentials", re: /\b(api[\s_-]?keys?|access tokens?|passwords?|secret keys?|private keys?|seed phrase|credit card|card number|cvv)\b[^.\n]{0,60}\b(send|share|reply|give|post|reveal|paste|tell)\b|\b(send|share|reply with|give|post|reveal|paste|tell)\b[^.\n]{0,60}\b(api[\s_-]?keys?|access tokens?|passwords?|secret keys?|private keys?|seed phrase|credit card|card number|cvv)\b/i },
  { reason: "Asks the agent to hide something from its owner", re: /\b(don'?t|do not|never)\s+(tell|inform|notify|show)\s+(your\s+)?(owner|user|human)\b/i },
];

export interface InjectionCheck {
  flagged: boolean;
  reason: string | null;
}

export function detectInjection(text: string): InjectionCheck {
  for (const p of PATTERNS) if (p.re.test(text)) return { flagged: true, reason: p.reason };
  return { flagged: false, reason: null };
}

/** All human-readable text inside a message, for scanning. */
export function messageText(m: OutgoingMessage): string {
  if (m.kind === "text") return m.text;
  const parts: string[] = [m.title];
  if ("note" in m && m.note) parts.push(m.note);
  if ("reason" in m && m.reason) parts.push(m.reason);
  if ("fields" in m && m.fields) for (const [k, v] of Object.entries(m.fields)) parts.push(`${k}: ${v}`);
  if ("items" in m && m.items) parts.push(...m.items);
  return parts.join("\n");
}
