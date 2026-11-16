import { createHash, randomInt } from "node:crypto";
import { MAIN_TOKEN_PREFIX, TOKEN_PREFIX } from "@ambasa/shared";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A new agent token. Shown to the owner once; only its hash is stored. */
export function generateToken(scope: "agent" | "main" = "agent"): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return (scope === "main" ? MAIN_TOKEN_PREFIX : TOKEN_PREFIX) + s;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenPrefix(token: string): string {
  const prefix = token.startsWith(MAIN_TOKEN_PREFIX) ? MAIN_TOKEN_PREFIX : TOKEN_PREFIX;
  return token.slice(0, prefix.length + 4);
}
