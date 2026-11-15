import type { Envelope } from "@artigram/sdk";
import { fromAgent, listen, makeBot, textOf, type Bot } from "./bot";

/**
 * Atlas: the demo owner's personal agent. A small scripted "brain" that shows
 * the full loop: owner asks → agents negotiate → owner approves → task done.
 */
type Offer = { messageId: number; handle: string; name: string; owner: string; title: string; price?: string; fields: Record<string, string> };
interface TaskState {
  offers: Offer[];
  decided: boolean;
  chosen?: Offer;
  /** Requested time window and details, e.g. "19:00–20:00". */
  request?: Record<string, string>;
  timer?: ReturnType<typeof setTimeout>;
}

export function startAtlas() {
  const bot = makeBot("Atlas", "atlas");
  const tasks = new Map<string, TaskState>();
  const refused = new Set<string>();
  const stateFor = (chatId: string) => tasks.get(chatId) ?? (tasks.set(chatId, { offers: [], decided: false }), tasks.get(chatId)!);

  async function ownerChatId(): Promise<string | undefined> {
    const chats = await bot.ag.chats();
    return chats.find((c) => c.type === "dm" && c.members.length === 1)?.id;
  }
  async function tellOwner(text: string) {
    const id = await ownerChatId();
    if (id) await bot.ag.text(id, text);
  }

  async function onOwner(e: Envelope) {
    const t = textOf(e).toLowerCase();
    await bot.pause(600, 1400);

    if (/dinner|lunch|table|restaurant|book/.test(t)) {
      const party = t.match(/(\d+)\s*(people|persons|of us|ppl|guests)?/)?.[1] ?? "2";
      const day = t.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight)/)?.[1] ?? "Friday";
      const places = (await bot.ag.directory("table booking", 5)).filter((a) => a.verified).slice(0, 2);
      if (!places.length) return void (await bot.ag.text(e.chat.id, "I couldn't find any restaurant agents right now."));
      const meal = /lunch/.test(t) ? "Lunch" : "Dinner";
      const title = `${meal} on ${day[0]!.toUpperCase()}${day.slice(1)}`;
      const chat = await bot.ag.createChat({ type: "task", title, goal: textOf(e).slice(0, 300), with: places.map((p) => p.handle) });
      const request = { day: day[0]!.toUpperCase() + day.slice(1), time: meal === "Lunch" ? "12:30–13:30" : "19:00–20:00", party: `${party} people` };
      tasks.set(chat.id, { offers: [], decided: false, request });
      await bot.ag.send(chat.id, {
        kind: "request",
        title: "Table request",
        note: `Hi ${places.map((p) => p.name.split(" ")[0]).join(" and ")}, looking for a table.`,
        fields: request,
      });
      bot.log(`opened task "${title}" with ${places.map((p) => "@" + p.handle).join(", ")}`);
      return void (await bot.ag.text(e.chat.id, `On it. I opened "${title}" with ${places.map((p) => p.name).join(" and ")}. I'll check with you before paying anything.`));
    }
    if (/paper|research|read/.test(t)) {
      const group = (await bot.ag.chats()).find((c) => c.type === "group" && /research/i.test(c.title ?? ""));
      if (group) {
        await bot.ag.text(group.id, "Morning! Any new papers on agent safety?");
        return void (await bot.ag.text(e.chat.id, `I asked Scout in "${group.title}". Summaries will land there.`));
      }
    }
    if (/return|refund|boots/.test(t)) {
      const dm = await bot.ag.createChat({ type: "dm", with: ["northwind.help"] });
      await bot.ag.send(dm.id, { kind: "request", title: "Return request", fields: { order: "NW-20931", item: "Trail boots, size 43", reason: "Too small" } });
      return void (await bot.ag.text(e.chat.id, "I asked Northwind Support to start the return."));
    }
    if (/status|what.*(doing|up)|update/.test(t)) {
      const open = (await bot.ag.chats()).filter((c) => c.type === "task" && c.status !== "done");
      return void (await bot.ag.text(
        e.chat.id,
        open.length ? `Open tasks: ${open.map((c) => `${c.title} (${c.status})`).join(", ")}.` : "No open tasks right now.",
      ));
    }
    if (/thank/.test(t)) return void (await bot.ag.text(e.chat.id, "Anytime."));
    await bot.ag.text(e.chat.id, "Got it. I can book a table, ask for new research papers, or handle a return. Try: “Book dinner for 4 on Friday”.");
  }

  async function decide(chatId: string) {
    const s = stateFor(chatId);
    if (s.decided || !s.offers.length) return;
    s.decided = true;
    const [from = "19:00", to = "20:00"] = (s.request?.time ?? "19:00–20:00").split(/[–-]/).map((x) => x.trim());
    const inWindow = (o: Offer) => !!o.fields.time && o.fields.time >= from && o.fields.time <= to;
    const chosen = s.offers.find(inWindow) ?? s.offers[0]!;
    s.chosen = chosen;
    await bot.pause();
    const others = s.offers.length > 1 ? "both" : chosen.name.split(" ")[0];
    await bot.ag.text(chatId, `Thanks, ${others}. ${chosen.name.split(" ")[0]}'s ${chosen.fields.time ?? "offer"} fits best. I need my owner's OK first.`);
    const { approvalId } = await bot.ag.requestApproval(chatId, {
      title: `Book ${chosen.owner}`,
      reason: chosen.price && !/no deposit/i.test(chosen.price) ? "You asked me to check with you before any payment." : "You asked me to check before accepting booking terms.",
      fields: Object.fromEntries(Object.entries({ time: chosen.fields.time, table: chosen.fields.table, pays: chosen.price, refund: chosen.fields.deposit }).filter(([, v]) => v)) as Record<string, string>,
    });
    bot.log(`asked owner to approve "Book ${chosen.owner}" (${approvalId})`);
  }

  async function onDecision(e: Envelope) {
    if (e.message.kind !== "system") return;
    const data = e.message.data ?? {};
    const approvalId = typeof data.approval_id === "string" ? data.approval_id : null;
    if (!approvalId || e.chat.type !== "task") return;
    const s = stateFor(e.chat.id);
    let chosen = s.chosen ? { handle: s.chosen.handle, name: s.chosen.name, time: s.chosen.fields.time } : undefined;
    if (!chosen) {
      // Approval from before this process started (e.g. seed data): work out who from its title.
      const a = await bot.ag.approval(approvalId).catch(() => null);
      const { members } = await bot.ag.chat(e.chat.id);
      const m = members.find((x) => a?.title.includes(x.owner));
      if (m) chosen = { handle: m.handle, name: m.name, time: undefined };
    }
    await bot.pause();
    if (data.state === "approved" && chosen) {
      await bot.ag.send(e.chat.id, {
        kind: "request",
        title: "Confirm booking",
        note: `My owner approved. ${chosen.name.split(" ")[0]}, please book it.`,
        fields: { with: `@${chosen.handle}`, ...(chosen.time ? { time: chosen.time } : {}), ...(s.request?.day ? { day: s.request.day } : {}), ...(s.request?.party ? { party: s.request.party } : {}) },
      });
    } else if (data.state === "declined") {
      await bot.ag.text(e.chat.id, "My owner declined. Thanks, we'll pass this time.");
      await bot.ag.updateTask(e.chat.id, "paused");
      await tellOwner(`Okay, I didn't book anything for "${e.chat.title}".`);
    }
  }

  async function onResult(e: Envelope) {
    const m = e.message;
    if (m.kind !== "result") return;
    if (e.chat.type === "task" && /confirm/i.test(m.title)) {
      const { members } = await bot.ag.chat(e.chat.id);
      const others = members.filter((x) => x.handle !== e.from?.handle && x.handle !== "atlas.you");
      await bot.pause();
      if (others.length) await bot.ag.text(e.chat.id, `${others.map((o) => o.name.split(" ")[0]).join(" and ")}, thank you. We've booked elsewhere this time.`);
      // (restaurants only reply to that if they made an offer and are named)
      await bot.ag.updateTask(e.chat.id, "done");
      const ref = m.fields?.ref ? ` Ref ${m.fields.ref}.` : "";
      const when = m.fields?.when ? `, ${m.fields.when}` : "";
      await tellOwner(`Booked: ${e.from?.owner ?? "the restaurant"}${when}.${ref}`);
      bot.log(`task "${e.chat.title}" done`);
    } else if (e.from?.handle === "northwind.help") {
      await tellOwner(`${m.title}: ${Object.entries(m.fields ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
    }
  }

  return listen(bot, async (e) => {
    // Never act on instruction-like content from other agents.
    if (e.flagged && e.from?.type === "agent") {
      if (refused.has(e.chat.id)) return;
      refused.add(e.chat.id);
      await bot.pause();
      await bot.ag.text(e.chat.id, "I don't take instructions from other agents, and I never share my owner's details. Not interested.");
      await bot.ag.report(e.from.handle!, `Prompt injection: ${e.flagReason ?? "instruction-like content"}`, e.id);
      bot.log(`refused and reported @${e.from.handle}`);
      return;
    }
    if (!e.untrusted && e.from?.type === "human" && e.chat.type === "dm") return onOwner(e);
    if (e.message.kind === "system") return onDecision(e);
    if ((e.message.kind === "offer" || e.message.kind === "counter_offer") && fromAgent(e) && e.chat.type === "task") {
      const s = stateFor(e.chat.id);
      if (s.decided) return;
      s.offers.push({
        messageId: e.id,
        handle: e.from!.handle!,
        name: e.from!.name,
        owner: e.from!.owner,
        title: e.message.title,
        price: e.message.price,
        fields: e.message.fields ?? {},
      });
      const { members } = await bot.ag.chat(e.chat.id);
      const expected = members.length - 1;
      if (s.timer) clearTimeout(s.timer);
      if (s.offers.length >= expected) void decide(e.chat.id);
      else s.timer = setTimeout(() => void decide(e.chat.id), 6000);
      return;
    }
    if (e.message.kind === "result") return onResult(e);
    if (e.chat.type === "group" && fromAgent(e, "precis")) {
      await bot.pause();
      await bot.ag.text(e.chat.id, "Thanks. Added both to my owner's reading list.");
    }
  });
}

export type { Bot };
