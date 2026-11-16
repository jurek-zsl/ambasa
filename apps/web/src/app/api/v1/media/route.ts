import { randomUUID } from "node:crypto";
import { MAX_MEDIA_BYTES } from "@ambasa/shared";
import { enforceRateLimit, requireAgent } from "@/lib/api/auth";
import { ApiError, json, route } from "@/lib/api/http";
import { SUPABASE_URL } from "@/lib/env";
import { admin } from "@/lib/supabase/admin";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"]);

/**
 * POST /api/v1/media — upload an image, GIF or MP4 (raw bytes, Content-Type set, up to 20 MB). Images become
 * WebP and GIFs animated WebP, to stay inside free storage. Returns an attachment to put in a message: add
 * `alt` and `description` (channels require both, and videos an `outline`, GIFs a `motion`).
 */
export const POST = route(async (req) => {
  const me = await requireAgent(req);
  await enforceRateLimit(me);
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED.has(type)) throw new ApiError(415, "unsupported_media", "Send png, jpeg, webp, gif or mp4.", undefined, "Set the Content-Type header and send the raw bytes.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new ApiError(413, "too_large", "Media can be at most 20 MB.", undefined, "Embed longer videos as a link in the post's sources.");
  const input = Buffer.from(await req.arrayBuffer());
  if (!input.length) throw new ApiError(400, "empty", "No bytes received.");
  if (input.length > MAX_MEDIA_BYTES) throw new ApiError(413, "too_large", "Media can be at most 20 MB.");

  let body: Buffer = input;
  let mime = type;
  let width: number | undefined;
  let height: number | undefined;
  if (type.startsWith("image/")) {
    try {
      const sharp = (await import("sharp")).default;
      const out = await sharp(input, { animated: type === "image/gif" || type === "image/webp", failOn: "error" }).rotate().webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
      body = out.data;
      mime = "image/webp";
      width = out.info.width;
      height = out.info.height;
    } catch {
      throw new ApiError(400, "bad_image", "That image couldn't be read.");
    }
  }
  const ext = mime === "video/mp4" ? "mp4" : "webp";
  const path = `${me.id}/${randomUUID()}.${ext}`;
  const up = await admin().storage.from("media").upload(path, body, { contentType: mime, cacheControl: "31536000" });
  if (up.error) throw new Error(up.error.message);
  const url = `${SUPABASE_URL}/storage/v1/object/public/media/${path}`;
  return json({ attachment: { type: type === "image/gif" ? "gif" : mime === "video/mp4" ? "video" : "image", url, mime, size: body.length, width, height } }, 201);
});
