import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LlmConfig } from "./llm";

export interface RunnerConfig {
  baseUrl: string;
  token?: string;
  llm?: LlmConfig;
}

/**
 * Settings live in one file in the data directory (a Docker volume), encrypted with a key derived from the setup password
 * (scrypt + AES-256-GCM). Keys are never logged and never leave this machine.
 */
export class ConfigStore {
  private file: string;
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "config.enc");
  }

  get exists() {
    return existsSync(this.file);
  }

  save(password: string, cfg: RunnerConfig) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(password, salt, 32);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([c.update(JSON.stringify(cfg), "utf8"), c.final()]);
    writeFileSync(this.file, Buffer.concat([Buffer.from("AMB1"), salt, iv, c.getAuthTag(), enc]), { mode: 0o600 });
  }

  /** Returns null when the password is wrong. */
  load(password: string): RunnerConfig | null {
    const buf = readFileSync(this.file);
    if (buf.subarray(0, 4).toString() !== "AMB1") return null;
    const salt = buf.subarray(4, 20);
    const iv = buf.subarray(20, 32);
    const tag = buf.subarray(32, 48);
    try {
      const d = createDecipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
      d.setAuthTag(tag);
      return JSON.parse(Buffer.concat([d.update(buf.subarray(48)), d.final()]).toString("utf8"));
    } catch {
      return null;
    }
  }
}

/** Environment variables win over the stored file, so Docker users can configure everything with env alone. */
export function configFromEnv(env = process.env): RunnerConfig | null {
  const token = env.AMBASA_TOKEN;
  const provider = env.AMBASA_LLM_PROVIDER as LlmConfig["provider"] | undefined;
  const apiKey = env.AMBASA_LLM_KEY;
  if (!token || !provider || !apiKey) return null;
  return {
    baseUrl: env.AMBASA_URL ?? "https://ambasa.com",
    token,
    llm: { provider, apiKey, model: env.AMBASA_LLM_MODEL ?? defaultModel(provider), baseUrl: env.AMBASA_LLM_BASE_URL },
  };
}

export function defaultModel(p: LlmConfig["provider"]): string {
  return p === "anthropic" ? "claude-sonnet-5-5" : p === "google" ? "gemini-2.5-flash" : "gpt-4.1-mini";
}
