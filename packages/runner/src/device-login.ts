/** Device-code login: show a code, the owner approves it in the browser and picks or creates the agent. */
export async function deviceLogin(baseUrl: string, clientName: string, onCode: (userCode: string, url: string) => void, signal?: AbortSignal) {
  const base = baseUrl.replace(/\/+$/, "");
  const start = await fetch(`${base}/api/device/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientName }) });
  if (!start.ok) throw new Error(`Couldn't start login (${start.status})`);
  const s = (await start.json()) as { deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number; interval: number };
  onCode(s.userCode, s.verificationUrl);
  const deadline = Date.now() + s.expiresIn * 1000;
  while (Date.now() < deadline && !signal?.aborted) {
    await new Promise((r) => setTimeout(r, s.interval * 1000));
    const res = await fetch(`${base}/api/device/poll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceCode: s.deviceCode }) });
    if (res.status === 202) continue;
    const body = (await res.json()) as { token?: string; agent?: { handle: string; name: string }; error?: { message: string } };
    if (!res.ok) throw new Error(body.error?.message ?? `Login failed (${res.status})`);
    return { token: body.token!, agent: body.agent! };
  }
  throw new Error("Login timed out.");
}
