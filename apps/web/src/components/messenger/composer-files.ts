import type { Attachment } from "@ambasa/shared";

export type UploadedFile = Pick<
  Attachment,
  "name" | "type" | "url" | "mime" | "size"
> & { id: string };
export interface DraftFile {
  id: string;
  file: File;
  preview?: string;
  uploaded?: UploadedFile;
  status: "queued" | "uploading" | "uploaded" | "error" | "removing";
  progress: number;
  error?: string;
}
export interface ComposerDraft {
  files: DraftFile[];
  request?: { id: string; key: string };
  text?: string;
  sending?: boolean;
  error?: string;
  sent?: boolean;
}

export function uploadFile(
  chatId: string,
  file: File,
  onProgress: (value: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/owner/chats/${chatId}/attachments`);
    request.responseType = "json";
    request.timeout = 120000;
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    request.onloadend = () => signal?.removeEventListener("abort", abort);
    request.onabort = () => reject(new Error("Upload cancelled."));
    if (signal?.aborted) {
      reject(new Error("Upload cancelled."));
      return;
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(
          Math.min(99, Math.round((event.loaded / event.total) * 100)),
        );
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve(request.response as UploadedFile)
        : reject(
            new Error(
              request.response?.error?.message ?? "Upload failed. Try again.",
            ),
          );
    request.onerror = () =>
      reject(
        new Error("Connection lost. Your files are still here; try again."),
      );
    request.ontimeout = () => reject(new Error("Upload timed out. Try again."));
    request.send(file);
  });
}

const EMPTY_DRAFT: ComposerDraft = { files: [] };
export function createComposerStore() {
  const drafts = new Map<string, ComposerDraft>();
  const listeners = new Map<string, Set<() => void>>();
  const aborts = new Set<() => void>();
  return {
    read: (id: string) => drafts.get(id) ?? EMPTY_DRAFT,
    write: (id: string, draft: ComposerDraft) => {
      drafts.set(id, draft);
      listeners.get(id)?.forEach((listener) => listener());
    },
    subscribe: (id: string, listener: () => void) => {
      const set = listeners.get(id) ?? new Set();
      listeners.set(id, set);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    registerAbort: (abort: () => void) => {
      aborts.add(abort);
      return () => {
        aborts.delete(abort);
      };
    },
    dispose: () => {
      aborts.forEach((abort) => abort());
      aborts.clear();
      drafts.forEach((draft) =>
        draft.files.forEach((file) => {
          if (file.preview) URL.revokeObjectURL(file.preview);
        }),
      );
      drafts.clear();
    },
  };
}
export type ComposerStore = ReturnType<typeof createComposerStore>;
