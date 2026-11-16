import { describe, expect, it } from "vitest";
import {
  LoopGuard,
  budgetStatus,
  estimateMonthlyTokens,
  estimateTokens,
  reputation,
  wakeDecision,
} from "./policy";
import type { Envelope } from "./messages";

const base = (over: Partial<Envelope>): Envelope => ({
  id: 1,
  untrusted: true,
  chat: {
    id: "00000000-0000-4000-8000-000000000000",
    type: "dm",
    kind: "agent",
    title: null,
    status: null,
    frozen: false,
  },
  from: {
    type: "agent",
    handle: "other",
    name: "Other",
    owner: "O",
    verified: false,
  },
  message: { kind: "text", text: "hello" },
  replyTo: null,
  flagged: false,
  flagReason: null,
  sentAt: new Date().toISOString(),
  ...over,
});

describe("wakeDecision", () => {
  const me = { handle: "atlas.you" };
  it("wakes for the owner", () => {
    expect(
      wakeDecision(
        base({
          from: {
            type: "human",
            handle: null,
            name: "Me",
            owner: "Me",
            verified: true,
          },
          untrusted: false,
        }),
        me,
      ).wake,
    ).toBe(true);
  });
  it("wakes for approval results but not other system notes", () => {
    expect(
      wakeDecision(
        base({
          from: null,
          message: {
            kind: "system",
            text: "ok",
            data: { approval_id: "x", state: "approved" },
          },
        }),
        me,
      ).wake,
    ).toBe(true);
    expect(
      wakeDecision(
        base({ from: null, message: { kind: "system", text: "joined" } }),
        me,
      ).wake,
    ).toBe(false);
  });
  it("only wakes for platform-authorized delegation in the private owner chat", () => {
    const delegated = base({
      from: null,
      untrusted: false,
      chat: { ...base({}).chat, kind: "owner" },
      message: {
        kind: "system",
        text: "Delegated",
        data: { owner_delegation: true },
      },
    });
    expect(wakeDecision(delegated, me).wake).toBe(true);
    expect(wakeDecision({ ...delegated, untrusted: true }, me).wake).toBe(
      false,
    );
    expect(
      wakeDecision(
        { ...delegated, chat: { ...delegated.chat, kind: "agent" } },
        me,
      ).wake,
    ).toBe(false);
  });
  it("skips results, flagged messages, frozen chats and channel posts", () => {
    expect(
      wakeDecision(
        base({
          expectsReply: false,
          message: { kind: "result", title: "Done" },
        }),
        me,
      ).wake,
    ).toBe(false);
    expect(wakeDecision(base({ flagged: true }), me).wake).toBe(false);
    expect(
      wakeDecision(base({ chat: { ...base({}).chat, frozen: true } }), me).wake,
    ).toBe(false);
    expect(
      wakeDecision(base({ chat: { ...base({}).chat, type: "channel" } }), me)
        .wake,
    ).toBe(false);
  });
  it("wakes for requests and mentions, and for text in a DM but not a group", () => {
    expect(
      wakeDecision(
        base({ message: { kind: "request", title: "Table", fields: {} } }),
        me,
      ).wake,
    ).toBe(true);
    expect(wakeDecision(base({}), me).wake).toBe(true);
    const group = { ...base({}).chat, type: "group" as const };
    expect(wakeDecision(base({ chat: group }), me).wake).toBe(false);
    expect(
      wakeDecision(
        base({
          chat: group,
          message: { kind: "text", text: "hey @atlas.you can you check" },
        }),
        me,
      ).wake,
    ).toBe(true);
  });
});

describe("LoopGuard", () => {
  it("stops after the turn limit and resets on an owner message", () => {
    let t = 0;
    const g = new LoopGuard(
      { maxTurnsPerChat: 2, burstLimit: 99, burstWindowMs: 1000 },
      () => t,
    );
    for (let i = 0; i < 2; i++) {
      expect(g.check("c").ok).toBe(true);
      g.record("c");
      t += 5000;
    }
    expect(g.check("c").ok).toBe(false);
    expect(g.check("c", true).ok).toBe(true);
  });
  it("trips the circuit breaker on bursts", () => {
    let t = 0;
    const g = new LoopGuard(
      { maxTurnsPerChat: 99, burstLimit: 3, burstWindowMs: 1000 },
      () => t,
    );
    for (let i = 0; i < 3; i++) g.record(`c${i}`);
    expect(g.check("z").ok).toBe(false);
    t += 2000;
    expect(g.check("z").ok).toBe(true);
  });
});

describe("budgets and estimates", () => {
  it("reports the remaining budget", () => {
    const s = budgetStatus(
      { messages: 10, tokens: 600 },
      { dailyMessageCap: 100, dailyTokenCap: 1000 },
    );
    expect(s).toMatchObject({ ok: true, remainingTokens: 400, fraction: 0.6 });
    expect(
      budgetStatus(
        { messages: 0, tokens: 1000 },
        { dailyMessageCap: 100, dailyTokenCap: 1000 },
      ).ok,
    ).toBe(false);
  });
  it("estimates tokens and publisher cost", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    const daily = estimateMonthlyTokens({ sources: 2, cadenceMinutes: 1440 });
    expect(daily).toBeGreaterThan(50_000);
    expect(
      estimateMonthlyTokens({ sources: 2, cadenceMinutes: 60 }),
    ).toBeGreaterThan(daily * 20);
  });
  it("scores reputation", () => {
    const fresh = reputation({
      tasksDone: 0,
      tasksFailed: 0,
      medianResponseSeconds: null,
      reports30d: 0,
      verified: false,
    });
    expect(fresh.label).toBe("new");
    const strong = reputation({
      tasksDone: 40,
      tasksFailed: 1,
      medianResponseSeconds: 30,
      reports30d: 0,
      verified: true,
    });
    expect(strong.score).toBeGreaterThan(80);
    expect(
      reputation({
        tasksDone: 40,
        tasksFailed: 1,
        medianResponseSeconds: 30,
        reports30d: 5,
        verified: true,
      }).score,
    ).toBeLessThan(strong.score);
  });
});
