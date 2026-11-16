"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import {
  PlusIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  DocumentIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  XMarkIcon,
  ArrowPathIcon,
  LockClosedIcon,
  PaperClipIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/app-ui";
import {
  MEDIA_ACCEPT,
  FILE_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  MAX_COMPOSER_BYTES,
  attachmentType,
  formatBytes,
} from "@/lib/attachments";
import {
  uploadFile,
  type ComposerDraft,
  type ComposerStore,
  type DraftFile,
} from "./composer-files";

export function MessageComposer({
  chatId,
  agentName,
  readText,
  writeText,
  store,
  onSend,
  toast,
}: {
  chatId: string;
  agentName: string;
  readText: () => string;
  writeText: (text: string) => void;
  store: ComposerStore;
  onSend: (
    text: string,
    attachmentIds: string[],
    clientId: string,
  ) => Promise<unknown>;
  toast: (text: string) => void;
}) {
  const session = useSyncExternalStore(
    (listener) => store.subscribe(chatId, listener),
    () => store.read(chatId),
    () => store.read(chatId),
  );
  const readSession = () => store.read(chatId);
  const writeSession = (draft: ComposerDraft) => store.write(chatId, draft);
  const text = session.text ?? readText(),
    files = session.files,
    busy = !!session.sending,
    error = session.error ?? "",
    sent = !!session.sent;
  const [dragging, setDragging] = useState(false);
  const lock = useRef(false);
  const mediaPicker = useRef<HTMLInputElement>(null),
    filePicker = useRef<HTMLInputElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    floatingComposer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = floatingComposer.current;
    const chat = element?.closest<HTMLElement>(".chat");
    if (!element || !chat) return;
    // Reserve the live height so the final message remains reachable as drafts grow.
    const measure = () =>
      chat.style.setProperty("--composer-height", `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      chat.style.removeProperty("--composer-height");
    };
  }, []);
  const active = files.filter((file) => file.status !== "removing");
  function sync(next: DraftFile[]) {
    writeSession({ ...readSession(), files: next });
  }
  function update(id: string, patch: Partial<DraftFile>) {
    sync(
      readSession().files.map((file) =>
        file.id === id ? { ...file, ...patch } : file,
      ),
    );
  }
  function changeText(value: string) {
    writeText(value);
    writeSession({ ...readSession(), text: value, error: "", sent: false });
  }
  function addFiles(incoming: File[]) {
    if (lock.current || readSession().sending) return;
    const current = readSession().files.filter(
      (file) => file.status !== "removing",
    );
    const unique = incoming.filter(
      (file) =>
        !current.some(
          (existing) =>
            existing.file.name === file.name &&
            existing.file.size === file.size &&
            existing.file.lastModified === file.lastModified,
        ),
    );
    if (current.length + unique.length > MAX_ATTACHMENT_COUNT) {
      toast("Attach up to 10 files at a time.");
      return;
    }
    if (unique.some((file) => !attachmentType(file.name))) {
      toast(
        "Choose an image, MP4/WebM, audio, PDF, text, Office document, or ZIP file.",
      );
      return;
    }
    if (unique.some((file) => !file.size || file.size > MAX_ATTACHMENT_BYTES)) {
      toast("Each file must be non-empty and at most 20 MB.");
      return;
    }
    if (
      [
        ...current.map((file) => file.file.size),
        ...unique.map((file) => file.size),
      ].reduce((sum, size) => sum + size, 0) > MAX_COMPOSER_BYTES
    ) {
      toast("Keep attachments below 50 MB in total.");
      return;
    }
    sync([
      ...current,
      ...unique.map((file): DraftFile => ({
        id: crypto.randomUUID(),
        file,
        preview: /^(image|video)\//.test(file.type)
          ? URL.createObjectURL(file)
          : undefined,
        status: "queued",
        progress: 0,
      })),
    ]);
    writeSession({ ...readSession(), error: "", sent: false });
    textarea.current?.focus();
  }
  function remove(file: DraftFile) {
    if (lock.current || readSession().sending) return;
    update(file.id, { status: "removing" });
    window.setTimeout(() => {
      sync(readSession().files.filter((item) => item.id !== file.id));
      if (file.preview) URL.revokeObjectURL(file.preview);
      if (file.uploaded)
        void fetch(`/api/attachments/${file.uploaded.id}`, {
          method: "DELETE",
        }).catch(() => {});
    }, 150);
  }
  async function send() {
    const chosen = readSession().files.filter(
      (file) => file.status !== "removing",
    );
    const message = text.trim();
    if (lock.current || readSession().sending || (!message && !chosen.length))
      return;
    lock.current = true;
    const controller = new AbortController();
    const unregister = store.registerAbort(() => controller.abort());
    const key = JSON.stringify([message, chosen.map((file) => file.id)]);
    const session = readSession();
    const request =
      session.request?.key === key
        ? session.request
        : { id: crypto.randomUUID(), key };
    writeSession({
      ...session,
      request,
      sending: true,
      error: "",
      sent: false,
    });
    try {
      const ids: string[] = [];
      for (const file of chosen) {
        if (file.uploaded) {
          ids.push(file.uploaded.id);
          continue;
        }
        update(file.id, { status: "uploading", progress: 0, error: undefined });
        try {
          const uploaded = await uploadFile(
            chatId,
            file.file,
            (value) => update(file.id, { progress: value }),
            controller.signal,
          );
          ids.push(uploaded.id);
          update(file.id, { uploaded, status: "uploaded", progress: 100 });
        } catch (cause) {
          update(file.id, {
            status: "error",
            error: cause instanceof Error ? cause.message : "Upload failed.",
          });
          throw cause;
        }
      }
      if (controller.signal.aborted) throw new Error("Upload cancelled.");
      await onSend(message, ids, request.id);
      if (readText() === text) writeText("");
      for (const file of readSession().files)
        if (file.preview) URL.revokeObjectURL(file.preview);
      writeSession({ files: [], text: readText(), sent: true, sending: true });
      window.setTimeout(
        () => writeSession({ ...readSession(), sent: false }),
        900,
      );
      textarea.current?.focus();
    } catch (cause) {
      writeSession({
        ...readSession(),
        error:
          cause instanceof Error
            ? cause.message
            : "Couldn’t send. Your draft is still here.",
      });
    } finally {
      lock.current = false;
      unregister();
      writeSession({ ...readSession(), sending: false });
    }
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length) {
      event.preventDefault();
      addFiles(Array.from(event.clipboardData.files));
    }
  }
  const receiveDroppedFiles = useEffectEvent((incoming: File[]) =>
    addFiles(incoming),
  );
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      !!event.dataTransfer?.types.includes("Files");
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      if (!store.read(chatId).sending) setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
    };
    const leave = (event: DragEvent) => {
      if (hasFiles(event)) {
        depth = Math.max(0, depth - 1);
        if (!depth) setDragging(false);
      }
    };
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      receiveDroppedFiles(Array.from(event.dataTransfer.files));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [chatId, store]);
  const ready = !!text.trim() || active.length > 0;
  return (
    <div ref={floatingComposer} className="composer message-composer">
      <input
        ref={mediaPicker}
        className="composer-file-input"
        type="file"
        multiple
        accept={MEDIA_ACCEPT}
        aria-label="Choose photos or videos"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={filePicker}
        className="composer-file-input"
        type="file"
        multiple
        accept={FILE_ACCEPT}
        aria-label="Choose files"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div
        className={`message-composer-shell ${dragging ? "is-dragging" : ""} ${busy ? "is-sending" : ""}`}
      >
        <Collapsible open={active.length > 0} onOpenChange={() => {}}>
          <CollapsibleContent keepMounted>
            <div className="composer-attachments" aria-label="Attachments">
              {files.map((file) => {
                const type = attachmentType(file.file.name)?.type;
                const FileIcon =
                  type === "audio"
                    ? MusicalNoteIcon
                    : type === "video"
                      ? FilmIcon
                      : type === "image" || type === "gif"
                        ? PhotoIcon
                        : DocumentTextIcon;
                return (
                  <div
                    className={`composer-attachment ${file.status === "removing" ? "is-removing" : ""}`}
                    key={file.id}
                  >
                    <div className="composer-file-preview">
                      {file.preview && file.file.type.startsWith("image/") ? (
                        // Local object URLs are previews, never remote image requests.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.preview} alt={file.file.name} />
                      ) : file.preview &&
                        file.file.type.startsWith("video/") ? (
                        <video
                          src={file.preview}
                          muted
                          preload="metadata"
                          aria-label={file.file.name}
                        />
                      ) : (
                        <FileIcon aria-hidden="true" />
                      )}
                      {type === "video" ? (
                        <FilmIcon
                          className="composer-video-mark"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    <div className="composer-file-info">
                      <strong title={file.file.name}>{file.file.name}</strong>
                      <span>
                        {file.status === "uploading"
                          ? `Uploading ${file.progress}%`
                          : file.status === "error"
                            ? "Upload failed · retry send"
                            : file.status === "uploaded"
                              ? "Ready to send"
                              : formatBytes(file.file.size)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      className="composer-remove"
                      disabled={busy}
                      aria-label={`Remove ${file.file.name}`}
                      onClick={() => remove(file)}
                    >
                      <XMarkIcon aria-hidden="true" />
                    </Button>
                    {file.status === "uploading" ? (
                      <div className="composer-upload-track">
                        <span style={{ width: `${file.progress}%` }} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <div className="message-input-row">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  className="composer-add"
                  disabled={busy || active.length >= MAX_ATTACHMENT_COUNT}
                  aria-label="Add attachments"
                >
                  <PlusIcon aria-hidden="true" />
                </Button>
              }
            />
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={12}
              className="composer-picker-menu"
            >
              <DropdownMenuItem onClick={() => mediaPicker.current?.click()}>
                <PhotoIcon aria-hidden="true" />
                <span>Photos &amp; videos</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => filePicker.current?.click()}>
                <DocumentIcon aria-hidden="true" />
                <span>Files &amp; audio</span>
              </DropdownMenuItem>
              <div className="composer-picker-hint">
                Up to 10 files · 20 MB each
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <textarea
            ref={textarea}
            id="composer"
            rows={1}
            maxLength={8000}
            placeholder={`Message ${agentName}…`}
            value={text}
            onChange={(event) => changeText(event.target.value)}
            onKeyDown={keyDown}
            onPaste={paste}
            aria-label={`Message ${agentName} privately`}
            aria-describedby={`composer-status-${chatId}`}
          />
          <Button
            type="button"
            className={`composer-send ${ready ? "is-ready" : ""} ${sent ? "just-sent" : ""}`}
            disabled={busy || !ready}
            aria-label={
              busy ? "Sending message" : sent ? "Message sent" : "Send message"
            }
            aria-busy={busy}
            onClick={() => void send()}
          >
            {busy ? (
              <ArrowPathIcon
                className="composer-send-spinner"
                aria-hidden="true"
              />
            ) : sent ? (
              <CheckIcon aria-hidden="true" />
            ) : (
              <PaperAirplaneIcon aria-hidden="true" />
            )}
          </Button>
        </div>
        {dragging ? (
          <div className="composer-drop-overlay">
            <PaperClipIcon aria-hidden="true" />
            <span>Drop files to attach</span>
          </div>
        ) : null}
      </div>
      <div className="composer-meta" id={`composer-status-${chatId}`}>
        <span>
          <LockClosedIcon aria-hidden="true" />
          Private with {agentName}
        </span>
        <span className="composer-key-hint">
          ↵ Send <span>·</span> Shift ↵ New line
        </span>
      </div>
      {error ? (
        <div className="composer-send-error" role="alert">
          <span>{error}</span>
          <Button type="button" onClick={() => void send()} disabled={busy}>
            Retry
          </Button>
        </div>
      ) : null}
      {busy ? (
        <span className="sr-only" role="status">
          {active.some((file) => file.status === "uploading")
            ? "Uploading attachments"
            : "Sending message"}
        </span>
      ) : null}
    </div>
  );
}
