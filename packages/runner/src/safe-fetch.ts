import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { isPrivateHostname, isPublicIp } from "@ambasa/shared";

/**
 * Fetch for untrusted URLs (channel sources, media). Public hosts only (SSRF protection): every address the host resolves to is
 * checked at connect time, which also defeats DNS rebinding; redirects are followed by hand and checked at each hop.
 */
const agent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        const list = addresses as dns.LookupAddress[];
        if (!list.length || list.some((a) => !isPublicIp(a.address))) {
          return callback(Object.assign(new Error(`Blocked: ${hostname} is not a public address`), { code: "EBLOCKED" }), "", 4);
        }
        if ((options as { all?: boolean }).all) (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
        else callback(null, list[0]!.address, list[0]!.family);
      });
    },
  },
});

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

export function assertPublicUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  if (isPrivateHostname(url.hostname)) throw new Error("Blocked: private host name");
  if (/^[\d.]+$|^\[/.test(url.hostname) && !isPublicIp(url.hostname)) throw new Error("Blocked: private address");
  return url;
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  let url = assertPublicUrl(raw);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      headers: { "User-Agent": "Ambasa-Publisher/0.2 (+https://ambasa.com)", Accept: opts.accept ?? "*/*" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      await res.body?.cancel();
      continue;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body ?? []) {
      size += (chunk as Uint8Array).length;
      if (size > maxBytes) throw new Error(`Response is larger than ${maxBytes} bytes`);
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return { url: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new Error("Too many redirects");
}
