import { createHash } from "node:crypto";
import { z } from "zod";

/** An error with a stable `code` that agents can switch on, and a message people can read. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers?: Record<string, string>,
    /** What to do next. Agents read this instead of guessing. */
    public hint?: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found.`);

/** Approximate size of a payload in LLM tokens (about four characters each). */
const estTokens = (body: string) => String(Math.ceil(body.length / 4));

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  const body = JSON.stringify(data);
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", "X-Est-Tokens": estTokens(body), ...headers },
  });
}

/** Drops nulls, empty strings and empty arrays: fewer tokens for LLM consumers. */
export function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = compact(v);
    }
    return out;
  }
  return value;
}

/** `?fields=id,title` keeps only those keys on the items of any top-level list, or on the object itself. */
export function pickFields(data: unknown, fields: string[]): unknown {
  const pick = (o: unknown) =>
    o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => fields.includes(k))) : o;
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(pick);
  const out: Record<string, unknown> = {};
  let hadList = false;
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      hadList = true;
      out[k] = v.map(pick);
    } else out[k] = v;
  }
  return hadList ? out : pick(data);
}

/**
 * The response for token-efficient GET endpoints: honors `?fields=`, `?compact=1` and `If-None-Match`
 * (ETag/304), and always sends `X-Est-Tokens`.
 */
export function respond(req: Request, data: unknown, headers?: Record<string, string>) {
  const url = new URL(req.url);
  let out = data;
  const fields = url.searchParams.get("fields");
  if (fields) out = pickFields(out, fields.split(",").map((f) => f.trim()).filter(Boolean));
  if (url.searchParams.get("compact") === "1") out = compact(out);
  const body = JSON.stringify(out);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 20)}"`;
  const base = { ETag: etag, "X-Est-Tokens": estTokens(body), "Cache-Control": "private, no-cache", ...headers };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: base });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json", ...base } });
}

/** Wraps a route handler so thrown ApiErrors become JSON error responses. */
export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        return json({ error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) } }, e.status, e.headers);
      }
      console.error(e);
      return json({ error: { code: "internal", message: "Something went wrong on our side. Try again." } }, 500);
    }
  };
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "invalid_body", z.prettifyError(parsed.error));
  return parsed.data;
}

type DbResult = { data: unknown; error: { message: string } | null };

/**
 * Unwraps a query result; database errors become a 500. Use for selects that
 * always return rows and for writes. Use `maybe()` for lookups that can miss.
 */
export function check<R extends DbResult>(res: R): NonNullable<R["data"]> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<R["data"]>;
}

/** Unwraps a lookup that may find nothing (`maybeSingle()`). */
export function maybe<R extends DbResult>(res: R): R["data"] | null {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? null;
}
