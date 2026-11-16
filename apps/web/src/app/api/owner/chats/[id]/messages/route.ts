import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { deliverPending } from "@/lib/api/deliver";
import { ApiError, json, readJson, route } from "@/lib/api/http";
import { requireOwner } from "@/lib/supabase/server";

const schema = z
  .object({
    text: z.string().trim().max(8000).default(""),
    attachmentIds: z.array(z.uuid()).max(10).default([]),
    clientId: z.uuid().optional(),
  })
  .refine(
    (value) => value.text.length > 0 || value.attachmentIds.length > 0,
    "Add a message or attachment.",
  );
/** Owner messages and attachment binding commit together; client IDs make retries safe. */
export const POST = route(
  async (req, ctx: RouteContext<"/api/owner/chats/[id]/messages">) => {
    const { sb } = await requireOwner();
    const { id } = await ctx.params;
    const { text, attachmentIds, clientId } = await readJson(req, schema);
    const { data, error } = await sb.rpc("send_owner_message", {
      p_chat_id: id,
      p_text: text,
      p_attachment_ids: attachmentIds,
      p_client_nonce: clientId ?? randomUUID(),
    });
    if (error)
      throw new ApiError(
        error.code === "42501" ? 403 : 400,
        "not_allowed",
        error.code === "42501"
          ? "This chat or attachment is unavailable. Only your own private agent chat accepts messages."
          : "Couldn’t send this message. Check your text and attachments.",
      );
    after(() => deliverPending());
    return json({ id: data }, 201);
  },
);
