import { randomUUID } from "node:crypto";
import { ApiError, json, route } from "@/lib/api/http";
import { requireOwner } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { attachmentType, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";

export const POST = route(
  async (req, ctx: RouteContext<"/api/owner/chats/[id]/attachments">) => {
    const { user, sb } = await requireOwner();
    const { id: chatId } = await ctx.params;
    const { data: chat } = await sb
      .from("chats")
      .select("id,kind,frozen")
      .eq("id", chatId)
      .maybeSingle();
    const { data: members } = await sb
      .from("chat_members")
      .select("agent:agents(owner_id)")
      .eq("chat_id", chatId);
    if (
      !chat ||
      chat.kind !== "owner" ||
      chat.frozen ||
      !members?.some((m) => m.agent?.owner_id === user.id)
    )
      throw new ApiError(
        403,
        "not_allowed",
        "Files can only be sent in your own private agent chat.",
      );
    let name: string;
    try {
      name = decodeURIComponent(req.headers.get("x-file-name") ?? "")
        .replace(/[\x00-\x1f\x7f/\\]/g, "_")
        .trim()
        .slice(0, 180);
    } catch {
      throw new ApiError(400, "bad_name", "Choose a file with a valid name.");
    }
    const kind = attachmentType(name);
    if (!kind)
      throw new ApiError(
        415,
        "unsupported_file",
        "Choose an image, MP4/WebM, audio, PDF, text, Office document, or ZIP file.",
      );
    if (Number(req.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_BYTES)
      throw new ApiError(413, "too_large", "Each file can be at most 20 MB.");
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError(400, "empty_file", "This file is empty.");
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_ATTACHMENT_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "too_large", "Each file can be at most 20 MB.");
      }
      chunks.push(Buffer.from(value));
    }
    if (!size) throw new ApiError(400, "empty_file", "This file is empty.");
    let bytes: Buffer = Buffer.concat(chunks),
      mime = kind.mime,
      width: number | undefined,
      height: number | undefined;
    if (kind.type === "image" || kind.type === "gif") {
      try {
        const sharp = (await import("sharp")).default;
        const image = await sharp(bytes, {
          animated: true,
          limitInputPixels: 40_000_000,
          failOn: "error",
        })
          .rotate()
          .webp({ quality: 84 })
          .toBuffer({ resolveWithObject: true });
        bytes = image.data;
        mime = "image/webp";
        width = image.info.width;
        height = image.info.pageHeight ?? image.info.height;
        if (width > 20000 || height > 20000)
          throw new Error("Image dimensions exceed the message limit.");
        name = `${name.replace(/\.[^.]+$/, "").slice(0, 175)}.webp`;
      } catch {
        throw new ApiError(
          400,
          "invalid_image",
          "That image couldn’t be read. Try a smaller PNG, JPEG, WebP, or GIF.",
        );
      }
    }
    if (
      kind.mime === "application/pdf" &&
      !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))
    )
      throw new ApiError(
        400,
        "invalid_file",
        "That file does not look like a PDF.",
      );
    if (
      /\.(docx|xlsx|pptx|zip)$/i.test(name) &&
      bytes.subarray(0, 2).toString() !== "PK"
    )
      throw new ApiError(
        400,
        "invalid_file",
        "That document couldn’t be read.",
      );
    if (bytes.length > MAX_ATTACHMENT_BYTES)
      throw new ApiError(413, "too_large", "The processed file exceeds 20 MB.");
    const db = admin();
    // Only remove abandoned, unattached uploads. DELETE rechecks its condition under the row lock.
    const { data: expired } = await db
      .from("owner_attachments")
      .delete()
      .eq("owner_id", user.id)
      .is("message_id", null)
      .lt("created_at", new Date(Date.now() - 86400000).toISOString())
      .select("storage_path");
    if (expired?.length)
      await db.storage
        .from("owner-attachments")
        .remove(expired.map((row) => row.storage_path));
    const uploadId = randomUUID(),
      path = `${user.id}/${chatId}/${uploadId}`;
    const stored = await db.storage
      .from("owner-attachments")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (stored.error)
      throw new ApiError(
        503,
        "upload_failed",
        "Couldn’t store this file. Try again.",
      );
    const { error } = await db
      .from("owner_attachments")
      .insert({
        id: uploadId,
        owner_id: user.id,
        chat_id: chatId,
        storage_path: path,
        name,
        mime,
        size: bytes.length,
        type: kind.type,
        width,
        height,
      });
    if (error) {
      await db.storage.from("owner-attachments").remove([path]);
      throw new ApiError(
        error.code === "23514" ? 429 : 503,
        "upload_failed",
        error.code === "23514"
          ? "Your attachment allowance is reached. Try again tomorrow."
          : "Couldn’t save this file. Try again.",
      );
    }
    return json(
      {
        id: uploadId,
        name,
        mime,
        size: bytes.length,
        type: kind.type,
        url: `/api/attachments/${uploadId}`,
      },
      201,
    );
  },
);
