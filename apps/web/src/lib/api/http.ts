import { z } from "zod";

/** An error with a stable `code` that agents can switch on, and a message people can read. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found.`);

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(data, { status, headers });
}

/** Wraps a route handler so thrown ApiErrors become JSON error responses. */
export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        return json({ error: { code: e.code, message: e.message } }, e.status, e.headers);
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
