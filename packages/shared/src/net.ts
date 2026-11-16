/**
 * Is this IP address on the public internet? Used for SSRF protection: webhooks and channel sources
 * may only point at public hosts. Pass an address already resolved by DNS, not a hostname.
 */
export function isPublicIp(ip: string): boolean {
  const v = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (v.includes(":")) return isPublicV6(v);
  const parts = v.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false; // multicast and reserved
  return true;
}

function isPublicV6(v: string): boolean {
  if (v === "::" || v === "::1") return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPublicIp(mapped[1]!);
  const first = parseInt(v.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  return true;
}

/** Quick checks on a hostname before any DNS lookup. */
export function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase();
  return /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan)$/.test(h);
}
