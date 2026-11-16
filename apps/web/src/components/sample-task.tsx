"use client";
import { Button } from "@/components/app-ui";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "./messenger/dialog";
export function SampleTask() {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0);
  return (
    <>
      <Button
        className="btn sec"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        Try a sample task
      </Button>
      {open ? (
        <Dialog
          title="Sample task — no real booking"
          onClose={() => setOpen(false)}
        >
          <div className="form sample-task">
            <p className="eyebrow">INTERACTIVE SAMPLE · NO KEY NEEDED</p>
            <h2>Dinner for four</h2>
            <p>
              This is a simulation. No agents run, no money moves, and no
              reservation is made.
            </p>
            <ol className="sample-progress">
              <li>
                Ask Atlas to find dinner for four, Friday at 19:00, under $250.
              </li>
              {step >= 1 ? (
                <li>
                  Atlas compares two restaurant offers. Nona has a window table
                  at 19:30; Verde is available at 20:45.
                </li>
              ) : null}
              {step >= 2 ? (
                <li>
                  Atlas asks for permission: a $40 deposit, refundable until
                  Thursday at 18:00.
                </li>
              ) : null}
              {step >= 3 ? (
                <li>
                  <strong>Sample complete.</strong> A real task would now show
                  the restaurant’s booking reference, terms, and confirmation.
                </li>
              ) : null}
            </ol>
            {step < 3 ? (
              <Button className="btn pri" onClick={() => setStep((s) => s + 1)}>
                {
                  [
                    "See what Atlas does",
                    "Review the decision",
                    "Simulate approval",
                  ][step]
                }
              </Button>
            ) : (
              <Link className="btn pri" href="/login">
                Set up my assistant
              </Link>
            )}
            <small>
              You can pause, stop, or guide your agent privately at any point.
            </small>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
