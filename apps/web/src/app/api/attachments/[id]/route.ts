import { requireAgent } from "@/lib/api/auth";
import { ApiError, json, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

type Context = RouteContext<"/api/attachments/[id]">;
const read = route(async (req, ctx: Context) => {
  const { id } = await ctx.params;
  const agent =
    req.headers.has("authorization") || req.headers.has("x-worker-secret")
      ? await requireAgent(req)
      : null;
  const owner = agent ? null : await requireOwner();
  const db = admin();
  const { data: file } = await db
    .from("owner_attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!file) throw new ApiError(404, "not_found", "File not found.");
  if (agent) {
    const { data: member } = await db
      .from("chat_members")
      .select("agent_id")
      .eq("chat_id", file.chat_id)
      .eq("agent_id", agent.id)
      .maybeSingle();
    if (!file.message_id || agent.owner_id !== file.owner_id || !member)
      throw new ApiError(404, "not_found", "File not found.");
  } else if (file.owner_id !== owner?.user.id)
    throw new ApiError(404, "not_found", "File not found.");
  const inline = ["image", "gif", "video", "audio"].includes(file.type);
  const headers = new Headers({
    "Content-Type": file.mime,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    Vary: "Cookie, Authorization, Range",
  });
  if (req.method === "HEAD") {
    headers.set("Content-Length", String(file.size));
    return new Response(null, { headers });
  }
  const signed = await db.storage
    .from("owner-attachments")
    .createSignedUrl(file.storage_path, 60);
  if (!signed.data)
    throw new ApiError(404, "not_found", "File is no longer available.");
  const upstream = await fetch(signed.data.signedUrl, {
    headers: req.headers.has("range")
      ? { Range: req.headers.get("range")! }
      : {},
    cache: "no-store",
  });
  if (!upstream.ok && upstream.status !== 416)
    throw new ApiError(404, "not_found", "File is no longer available.");
  for (const key of ["Content-Length", "Content-Range"]) {
    const value = upstream.headers.get(key);
    if (
      value &&
      !(key === "Content-Length" && upstream.headers.has("content-encoding"))
    )
      headers.set(key, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
});
export const GET = read;
export const HEAD = read;
export const DELETE = route(async (_req, ctx: Context) => {
  const { user } = await requireOwner();
  const { id } = await ctx.params;
  const db = admin();
  const { data, error } = await db
    .from("owner_attachments")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("message_id", null)
    .select("storage_path")
    .maybeSingle();
  if (error)
    throw new ApiError(
      503,
      "delete_failed",
      "Couldn’t remove the pending upload.",
    );
  if (!data)
    throw new ApiError(
      409,
      "already_sent",
      "This file is already sent or unavailable.",
    );
  await db.storage.from("owner-attachments").remove([data.storage_path]);
  return json({ removed: true });
});
