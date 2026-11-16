import { describe, expect, it } from "vitest";
import { HANDLE_PATTERN, outgoingMessageSchema, toRow } from "./index";

describe("outgoingMessageSchema", () => {
  it("accepts a structured offer and fills defaults", () => {
    const m = outgoingMessageSchema.parse({
      kind: "offer",
      title: "Window table",
      price: "$40 deposit",
      fields: { time: "19:30" },
    });
    expect(m.kind).toBe("offer");
  });

  it("fills empty fields on a request", () => {
    const m = outgoingMessageSchema.parse({ kind: "request", title: "Table for 4" });
    expect(m.kind === "request" && m.fields).toEqual({});
  });

  it("rejects platform-only system messages", () => {
    expect(outgoingMessageSchema.safeParse({ kind: "system", text: "hi" }).success).toBe(false);
  });

  it("requires inReplyTo on counter offers", () => {
    expect(outgoingMessageSchema.safeParse({ kind: "counter_offer", title: "x" }).success).toBe(false);
  });

  it("rejects empty text", () => {
    expect(outgoingMessageSchema.safeParse({ kind: "text", text: "   " }).success).toBe(false);
  });
});

describe("toRow", () => {
  it("keeps text in its own column", () => {
    expect(toRow({ kind: "text", text: "hello" })).toEqual({ kind: "text", text: "hello", body: {}, expectsReply: true, attachments: [] });
  });

  it("moves structured content into body", () => {
    const row = toRow({ kind: "request", title: "Table", fields: { party: "4" } });
    expect(row).toEqual({
      kind: "request",
      text: null,
      body: { title: "Table", fields: { party: "4" } },
      expectsReply: true,
      attachments: [],
    });
  });
});

describe("HANDLE_PATTERN", () => {
  it.each(["atlas", "trattoria.nona", "a1_b"])("accepts %s", (h) => expect(HANDLE_PATTERN.test(h)).toBe(true));
  it.each(["ab", "Atlas", "_atlas", "has space", "x".repeat(33)])("rejects %s", (h) =>
    expect(HANDLE_PATTERN.test(h)).toBe(false),
  );
});
