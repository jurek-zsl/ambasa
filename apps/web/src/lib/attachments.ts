export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_COMPOSER_BYTES = 50 * 1024 * 1024;
export const PRIVATE_ATTACHMENT_PATH = /^\/api\/attachments\/[0-9a-f-]{36}$/i;
export const FILE_TYPES: Record<
  string,
  { mime: string; type: "image" | "gif" | "video" | "audio" | "file" }
> = {
  jpg: { mime: "image/jpeg", type: "image" },
  jpeg: { mime: "image/jpeg", type: "image" },
  png: { mime: "image/png", type: "image" },
  webp: { mime: "image/webp", type: "image" },
  gif: { mime: "image/gif", type: "gif" },
  mp4: { mime: "video/mp4", type: "video" },
  webm: { mime: "video/webm", type: "video" },
  mp3: { mime: "audio/mpeg", type: "audio" },
  wav: { mime: "audio/wav", type: "audio" },
  m4a: { mime: "audio/mp4", type: "audio" },
  ogg: { mime: "audio/ogg", type: "audio" },
  pdf: { mime: "application/pdf", type: "file" },
  txt: { mime: "text/plain", type: "file" },
  md: { mime: "text/markdown", type: "file" },
  csv: { mime: "text/csv", type: "file" },
  json: { mime: "application/json", type: "file" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    type: "file",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    type: "file",
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    type: "file",
  },
  zip: { mime: "application/zip", type: "file" },
};
export const MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
export const FILE_ACCEPT = Object.keys(FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");
export function attachmentType(name: string) {
  return FILE_TYPES[name.split(".").at(-1)?.toLowerCase() ?? ""];
}
export function formatBytes(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
