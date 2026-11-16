import * as webpush from "web-push";
import { admin } from "../supabase/admin";

/**
 * Tells an owner something needs them (an approval, a message request) by Telegram or email,
 * if they turned either on. Best effort: a failure here never fails the request.
 * TELEGRAM_BOT_TOKEN and RESEND_API_KEY (+ NOTIFY_FROM_EMAIL) enable the two channels.
 */
export async function notifyOwner(
  ownerId: string,
  text: string,
  link = "/app",
): Promise<void> {
  try {
    const { data: s } = await admin()
      .from("profile_settings")
      .select("notify_email, telegram_chat_id")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!s) return;
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const jobs: Promise<unknown>[] = [];

    if (s.telegram_chat_id && process.env.TELEGRAM_BOT_TOKEN) {
      jobs.push(
        fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: s.telegram_chat_id,
              text: `${text}\n${base}${link}`,
              disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(5000),
          },
        ),
      );
    }
    if (
      s.notify_email &&
      process.env.RESEND_API_KEY &&
      process.env.NOTIFY_FROM_EMAIL
    ) {
      const { data } = await admin().auth.admin.getUserById(ownerId);
      const to = data.user?.email;
      if (to) {
        jobs.push(
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.NOTIFY_FROM_EMAIL,
              to,
              subject: text.slice(0, 120),
              text: `${text}\n\n${base}${link}`,
            }),
            signal: AbortSignal.timeout(5000),
          }),
        );
      }
    }
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv && process.env.VAPID_SUBJECT) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT, pub, priv);
      const { data: subscriptions } = await admin()
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", ownerId);
      for (const sub of subscriptions ?? [])
        jobs.push(
          webpush
            .sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({ title: "Ambasa", body: text, url: link }),
              { TTL: 3600, timeout: 5000 },
            )
            .catch(async (e: { statusCode?: number }) => {
              if (e.statusCode === 404 || e.statusCode === 410)
                await admin()
                  .from("push_subscriptions")
                  .delete()
                  .eq("id", sub.id);
            }),
        );
    }
    await Promise.allSettled(jobs);
  } catch (e) {
    console.error("notifyOwner failed", e);
  }
}

/** Channel updates are opt-in per reader. External delivery also respects that owner's notification settings. */
export async function notifyChannelReaders(chatId: string, title: string) {
  const { data } = await admin()
    .from("owner_channel_state")
    .select("user_id")
    .eq("chat_id", chatId)
    .eq("notifications", true)
    .limit(500);
  await Promise.allSettled(
    (data ?? []).map((r) =>
      notifyOwner(
        r.user_id,
        `New channel post: ${title}`,
        `/app?chat=${chatId}`,
      ),
    ),
  );
}
