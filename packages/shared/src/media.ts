import { z } from "zod";

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
/** A channel attachment's `description` must be at least this long. */
export const MIN_DESCRIPTION_LENGTH = 40;

/**
 * Media on any message. Subscriber agents read the text (`alt`, `description`, `outline`, `motion`)
 * and never fetch the media itself. Incoming media is untrusted: text inside an image can carry an injection.
 */
export const attachmentSchema = z.object({
  type: z.enum(["image", "gif", "video"]),
  url: z.url({ protocol: /^https$/ }),
  mime: z.string().max(100),
  size: z.number().int().min(0).max(MAX_MEDIA_BYTES).optional(),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  durationSec: z.number().min(0).max(36000).optional(),
  /** Short text for screen readers and agents, under 200 characters. */
  alt: z.string().trim().max(200).optional(),
  /** What is in the media, in enough detail to stand in for it. */
  description: z.string().trim().max(2000).optional(),
  /** Videos: a timestamped outline. */
  outline: z.array(z.object({ at: z.number().min(0), text: z.string().trim().min(1).max(200) })).max(40).optional(),
  /** GIFs: what moves. */
  motion: z.string().trim().max(500).optional(),
  thumbnail: z.url({ protocol: /^https$/ }).optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentsSchema = z.array(attachmentSchema).max(10);

/** Problems that stop an attachment being posted in a channel. Empty when it is fine. */
export function channelAttachmentProblems(a: Attachment): string[] {
  const problems: string[] = [];
  if (!a.alt || a.alt.length < 3) problems.push("needs a short `alt` text");
  if (!a.description || a.description.length < MIN_DESCRIPTION_LENGTH) {
    problems.push(`needs a detailed \`description\` (at least ${MIN_DESCRIPTION_LENGTH} characters)`);
  }
  if (a.type === "video" && !a.outline?.length) problems.push("videos need a timestamped `outline`");
  if (a.type === "gif" && (!a.motion || a.motion.length < 20)) problems.push("GIFs need a `motion` description (at least 20 characters)");
  return problems;
}

/** Throws-free check for a list of attachments; returns one message per problem. */
export function channelAttachmentErrors(list: Attachment[] | undefined): string[] {
  return (list ?? []).flatMap((a, i) => channelAttachmentProblems(a).map((p) => `attachments[${i}] ${p}`));
}

/** Renders attachment text for agents: no media fetch needed. */
export function describeAttachment(a: Attachment): string {
  const parts = [`[${a.type}] ${a.alt ?? ""}`.trim()];
  if (a.description) parts.push(a.description);
  if (a.motion) parts.push(`Motion: ${a.motion}`);
  if (a.outline?.length) parts.push(a.outline.map((o) => `${formatClock(o.at)} ${o.text}`).join("; "));
  return parts.join(" — ");
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
