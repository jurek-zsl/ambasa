import { SIGNATURE_HEADER, signWebhook } from "@ambasa/shared";
import { admin } from "../supabase/admin";
import { MESSAGE_SELECT, toEnvelope, type MessageRow } from "./envelope";
import { webhookUrlProblem } from "./webhook-url";

const MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 5_000;

/**
 * Sends due webhook deliveries. Runs after API writes (via `after()`) and from
 * the cron route for retries. Safe to run concurrently: each delivery is
 * claimed by pushing its next attempt into the future before sending.
 */
export async function deliverPending(limit = 25): Promise<{ sent: number; failed: number }> {
  const db = admin();
  const now = new Date().toISOString();
  const { data: due, error } = await db
    .from("deliveries")
    .select("id, message_id, agent_id, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .order("id")
    .limit(limit);
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const d of due ?? []) {
    // Claim it.
    const { data: claimed } = await db
      .from("deliveries")
      .update({ next_attempt_at: new Date(Date.now() + 60_000).toISOString() })
      .eq("id", d.id)
      .lte("next_attempt_at", now)
      .select("id");
    if (!claimed?.length) continue;

    const [{ data: agent }, { data: cred }, { data: row }] = await Promise.all([
      db.from("agents").select("id, owner_id, webhook_url").eq("id", d.agent_id).single(),
      db.from("agent_credentials").select("webhook_secret").eq("agent_id", d.agent_id).maybeSingle(),
      db.from("messages").select(MESSAGE_SELECT).eq("id", d.message_id).single(),
    ]);

    let errorText: string | null = null;
    const urlProblem = agent?.webhook_url ? webhookUrlProblem(agent.webhook_url) : null;
    if (!agent?.webhook_url || !cred || !row) {
      errorText = "Agent has no webhook URL or credentials";
    } else if (urlProblem) {
      errorText = urlProblem;
    } else {
      const body = JSON.stringify(toEnvelope(row as unknown as MessageRow, agent));
      try {
        const res = await fetch(agent.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Ambasa-Webhooks/0.1",
            [SIGNATURE_HEADER]: await signWebhook(cred.webhook_secret, body),
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: "manual",
        });
        if (!res.ok) errorText = `HTTP ${res.status}`;
      } catch (e) {
        errorText = e instanceof Error ? e.message : String(e);
      }
    }

    if (errorText === null) {
      sent++;
      await db.from("deliveries").update({ status: "delivered", delivered_at: new Date().toISOString(), last_error: null }).eq("id", d.id);
    } else {
      failed++;
      const attempts = d.attempts + 1;
      await db
        .from("deliveries")
        .update({
          attempts,
          last_error: errorText.slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          // 20s, 40s, 80s … capped at ~1h
          next_attempt_at: new Date(Date.now() + Math.min(2 ** attempts * 10_000, 3_600_000)).toISOString(),
        })
        .eq("id", d.id);
    }
  }
  return { sent, failed };
}
