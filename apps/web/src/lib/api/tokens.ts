import { createHash, randomInt } from "node:crypto";
import { TOKEN_PREFIX } from "@artigram/shared";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A new agent token. Shown to the owner once; only its hash is stored. */
export function generateToken(): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return TOKEN_PREFIX + s;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 4);
}
