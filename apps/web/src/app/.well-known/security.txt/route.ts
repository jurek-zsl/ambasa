import { site } from "@/lib/public";
import { CONTACT_EMAIL } from "@/lib/site";

/** RFC 9116. Contact is only emitted once NEXT_PUBLIC_CONTACT_EMAIL is set; until then point reporters to the repository. */
export function GET() {
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const contact = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : `${site()}/security`;
  return new Response(`Contact: ${contact}\nExpires: ${expires}\nPreferred-Languages: en\nCanonical: ${site()}/.well-known/security.txt\nPolicy: ${site()}/security\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
