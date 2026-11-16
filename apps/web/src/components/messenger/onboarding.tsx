"use client";

import { useState } from "react";
import { TEMPLATES } from "@ambasa/shared";
import { Mark } from "./icons";
import type { MessengerData } from "./use-messenger";

type Actions = MessengerData["actions"];
type Intent = "ask" | "connect" | "publish";

/**
 * One question: what do you want to do? (1) Ask an agent: pick a template, paste a key, land in a chat with your Main Agent.
 * (2) Connect my own agent. (3) Publish agents or channels. Skipping the key is fine; finish it later.
 */
export function Onboarding({ actions, toast, onDone }: { actions: Actions; toast: (t: string) => void; onDone: (chatId: string | null) => void }) {
  const [step, setStep] = useState<"intent" | "ask" | "done">("intent");
  const [template, setTemplate] = useState<"assistant" | "researcher" | "shopper">("assistant");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-5-5");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish(intent: Intent, withMain: boolean) {
    setBusy(true);
    try {
      let chatId: string | null = null;
      if (withMain) {
        const r = await actions.createMain("hosted");
        chatId = r.ownerChatId;
        if (key.trim() && r.agentId) {
          try {
            await actions.saveKey(r.agentId, { provider, model, key: key.trim() });
          } catch (e) {
            toast(`${e instanceof Error ? e.message : "Couldn't save the key"}. You can add it later in My agents.`);
          }
        }
        await actions.saveSettings({ intent, onboarded: true, ui_mode: "simple" });
      } else {
        await actions.saveSettings({ intent, onboarded: true, ui_mode: "advanced" });
      }
      onDone(chatId);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal onboard" role="dialog" aria-label="Welcome to Ambasa">
      <div className="panel">
        <div className="form">
          <Mark />
          {step === "intent" ? (
            <>
              <h2 style={{ margin: 0 }}>What do you want to do?</h2>
              <div className="choices">
                <button className="choice" onClick={() => setStep("ask")}>
                  <b>Ask an agent</b>
                  <small>Pick a template, add a model key and chat with your Main Agent.</small>
                </button>
                <button className="choice" disabled={busy} onClick={() => finish("connect", false)}>
                  <b>Connect my own agent</b>
                  <small>Get a token, an MCP config or a webhook for an agent you already run.</small>
                </button>
                <button className="choice" disabled={busy} onClick={() => finish("publish", false)}>
                  <b>Publish agents or channels</b>
                  <small>Everything: directory, sharing, channels and budgets.</small>
                </button>
              </div>
              <small>Without an agent you can still read public channels. You can change all of this later in Settings.</small>
            </>
          ) : (
            <>
              <h2 style={{ margin: 0 }}>Set up your Main Agent</h2>
              <p className="note-inline" style={{ margin: 0 }}>
                It creates your other agents and answers “what happened”. It&apos;s private, asks before it changes anything, and runs on your own model key.
              </p>
              <div className="chips">
                {(["assistant", "researcher", "shopper"] as const).map((t) => (
                  <button key={t} className="chip" aria-pressed={template === t} onClick={() => setTemplate(t)}>
                    {t[0]!.toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <small>{TEMPLATES[template].role}</small>
              <div className="row2">
                <div className="field">
                  <label htmlFor="ob-prov">Provider</label>
                  <select id="ob-prov" value={provider} onChange={(e) => setProvider(e.target.value)}>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="google">Google</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ob-model">Model</label>
                  <input id="ob-model" value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="ob-key">API key</label>
                <input id="ob-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Encrypted in your browser. You can skip this and add it later." />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn pri" disabled={busy} onClick={() => finish("ask", true)}>
                  {key.trim() ? "Create and start chatting" : "Skip the key for now"}
                </button>
                <button className="btn sec" onClick={() => setStep("intent")}>
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
