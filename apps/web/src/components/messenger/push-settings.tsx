"use client";
import { Button } from "@/components/app-ui";

import { useEffect, useState } from "react";
export function PushSettings() {
  const [supported, setSupported] = useState(false),
    [enabled, setEnabled] = useState(false),
    [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/owner/push")
      .then((r) => r.json())
      .then((b) => {
        setConfigured(!!b.publicKey);
        setSupported(
          "serviceWorker" in navigator &&
            "PushManager" in window &&
            window.isSecureContext,
        );
      })
      .catch(() => {});
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => setEnabled(!!s));
  }, []);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (enabled) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          const response = await fetch("/api/owner/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          if (!response.ok) throw new Error("Could not remove subscription.");
          await sub.unsubscribe();
        }
        setEnabled(false);
        return;
      }
      const { publicKey } = await (await fetch("/api/owner/push")).json();
      if (!publicKey) throw new Error("Push is not configured on this server.");
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Allow notifications in your browser settings to enable push.",
        );
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const bytes = Uint8Array.from(
        atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      const res = await fetch("/api/owner/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        await sub.unsubscribe();
        throw new Error(
          (await res.json()).error?.message ?? "Could not subscribe.",
        );
      }
      setEnabled(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update notifications.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="push-settings">
      <div>
        <strong>Browser notifications</strong>
        <p>
          Decisions and completed tasks, linked directly to the right place.
        </p>
      </div>
      <Button
        className="btn sec sm"
        disabled={busy || !supported || (!configured && !enabled)}
        onClick={toggle}
      >
        {enabled ? "Turn off on this device" : "Enable on this device"}
      </Button>
      {!supported ? (
        <small>
          Use a supported secure browser. On iPhone, install Ambasa to your Home
          Screen.
        </small>
      ) : !configured ? (
        <small>
          Server setup required: configure the VAPID keys to enable push.
        </small>
      ) : null}
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
