"use client";
import { Button, Input } from "@/components/app-ui";

import { useState } from "react";
import type { Workspace } from "./types";
import type { MessengerData } from "./use-messenger";
export function UsageDetails({
  workspace,
  actions,
}: {
  workspace: Workspace;
  actions: MessengerData["actions"];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const groups = new Map<
    string,
    {
      provider: string;
      model: string;
      input: number;
      output: number;
      calls: number;
    }
  >();
  for (const r of workspace.modelUsage) {
    const key = `${r.provider}/${r.model}`,
      g = groups.get(key) ?? {
        provider: r.provider,
        model: r.model,
        input: 0,
        output: 0,
        calls: 0,
      };
    g.input += r.input_tokens;
    g.output += r.output_tokens;
    g.calls++;
    groups.set(key, g);
  }
  const entries = [...groups.entries()];
  return (
    <section className="sec">
      <h2>Recorded model usage</h2>
      <p className="lede">
        Last 30 days, up to the latest 1,000 reported calls. These are provider
        usage records, separate from conversation size.
      </p>
      {!entries.length ? (
        <div className="empty-state">
          <h3>No model calls reported yet</h3>
          <p>
            Hosted workers and updated runners report input and output tokens
            after each call. External agents must report their usage.
          </p>
        </div>
      ) : (
        <div className="usage-table">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
                <th>Estimated USD</th>
                <th>Rates</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, g]) => {
                const rate = workspace.rates.find(
                  (r) => r.model === g.model && r.provider === g.provider,
                );
                return (
                  <tr key={key}>
                    <td>
                      <strong>{g.model}</strong>
                      <small>
                        {g.provider} · {g.calls} calls
                      </small>
                    </td>
                    <td>{g.input.toLocaleString()}</td>
                    <td>{g.output.toLocaleString()}</td>
                    <td>
                      {rate
                        ? `$${((g.input * rate.input_per_million + g.output * rate.output_per_million) / 1e6).toFixed(4)}`
                        : "Rate not set"}
                    </td>
                    <td>
                      <Button
                        className="btn sec sm"
                        onClick={() => {
                          setEditing(key);
                          setInput(String(rate?.input_per_million ?? ""));
                          setOutput(String(rate?.output_per_million ?? ""));
                        }}
                      >
                        Set rates
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <form
          className="form panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const g = groups.get(editing)!;
            try {
              const res = await fetch("/api/owner/rates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider: g.provider,
                  model: g.model,
                  input: Number(input),
                  output: Number(output),
                }),
              });
              if (!res.ok) throw new Error("Could not save rates.");
              await actions.loadWorkspace();
              setEditing(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save.");
            }
          }}
        >
          <h3>USD per million tokens · {groups.get(editing)?.model}</h3>
          <div className="row2">
            <div className="field">
              <label htmlFor="rate-input">Input</label>
              <Input
                id="rate-input"
                type="number"
                min="0"
                max="100000"
                step="any"
                required
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="rate-output">Output</label>
              <Input
                id="rate-output"
                type="number"
                min="0"
                max="100000"
                step="any"
                required
                value={output}
                onChange={(e) => setOutput(e.target.value)}
              />
            </div>
          </div>
          <p>
            Use your provider’s rates. Estimates apply these rates to the
            displayed usage; caching, discounts, and other provider charges can
            differ.
          </p>
          {error ? <p role="alert">{error}</p> : null}
          <div className="acts">
            <Button className="btn pri">Save rates</Button>
            <Button
              className="btn sec"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
