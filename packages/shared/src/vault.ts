import nacl from "tweetnacl";

/**
 * The key vault's sealed box: a model key is encrypted in the owner's browser to the worker's public key, so Vercel and the database
 * only ever hold ciphertext and only the VPS (which holds the private key) can open it. Same construction as libsodium's sealed box:
 * a fresh ephemeral X25519 key pair per message, XSalsa20-Poly1305 inside. Format: base64(ephemeralPublic[32] | nonce[24] | box).
 * Trade-off: a VPS compromise exposes every key, so harden it and keep an off-box backup of the private key.
 */
export interface VaultKeys {
  publicKey: string;
  privateKey: string;
}

const b64 = {
  enc: (u: Uint8Array) => btoa(String.fromCharCode(...u)),
  dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

export function generateVaultKeys(): VaultKeys {
  const k = nacl.box.keyPair();
  return { publicKey: b64.enc(k.publicKey), privateKey: b64.enc(k.secretKey) };
}

export function seal(publicKey: string, plaintext: string): string {
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(new TextEncoder().encode(plaintext), nonce, b64.dec(publicKey), eph.secretKey);
  const out = new Uint8Array(32 + 24 + box.length);
  out.set(eph.publicKey, 0);
  out.set(nonce, 32);
  out.set(box, 56);
  return b64.enc(out);
}

export function open(keys: VaultKeys, ciphertext: string): string {
  const buf = b64.dec(ciphertext);
  if (buf.length < 56 + nacl.box.overheadLength) throw new Error("Ciphertext is too short");
  const msg = nacl.box.open(buf.subarray(56), buf.subarray(32, 56), buf.subarray(0, 32), b64.dec(keys.privateKey));
  if (!msg) throw new Error("Couldn't open the sealed key (wrong private key?)");
  return new TextDecoder().decode(msg);
}
