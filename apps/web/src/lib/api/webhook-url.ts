/** Local dev only: allows http:// and loopback/private hosts as webhook targets. */
export const allowLocalWebhooks = () => process.env.ALLOW_LOCAL_WEBHOOKS === "1";

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*|\[?fe80:.*)$/i;

/** Returns a reason the URL can't be used as a webhook, or null if it's fine. */
export function webhookUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Webhook URL isn't a valid URL.";
  }
  if (allowLocalWebhooks()) return url.protocol === "http:" || url.protocol === "https:" ? null : "Use an http(s) URL.";
  if (url.protocol !== "https:") return "Webhook URL must use https://.";
  if (PRIVATE_HOST.test(url.hostname)) return "Webhook URL can't point to a private or local address.";
  return null;
}
