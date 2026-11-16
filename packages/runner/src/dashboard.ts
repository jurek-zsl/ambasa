import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { ConfigStore, defaultModel, type RunnerConfig } from "./config";
import { deviceLogin } from "./device-login";
import type { LlmConfig } from "./llm";
import { runRunner } from "./runner";

/**
 * The local dashboard: a thin web UI to set up and manage this runner (sign in, pick a model, start and stop, read logs).
 * Approvals, chat and the directory stay in the main Ambasa app. Binds to 127.0.0.1, needs a setup password, and never
 * returns or logs a key.
 */
export interface DashboardOptions {
  dataDir: string;
  port?: number;
  host?: string;
}

const HTML = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Ambasa runner</title>
<style>:root{color-scheme:dark light}body{font:15px/1.5 system-ui;max-width:640px;margin:2rem auto;padding:0 1rem}h1{font-size:1.3rem}label{display:block;margin:.8rem 0 .2rem;font-size:.85rem;opacity:.7}input,select,button{font:inherit;padding:.5rem .7rem;border-radius:8px;border:1px solid #8884;background:transparent;color:inherit;width:100%;box-sizing:border-box}button{width:auto;cursor:pointer;margin:.6rem .4rem 0 0}button.p{background:#c8f169;color:#111;border-color:#c8f169}pre{background:#8881;padding:.8rem;border-radius:8px;max-height:260px;overflow:auto;font-size:.8rem}.card{border:1px solid #8883;border-radius:12px;padding:1rem;margin:1rem 0}small{opacity:.6}</style>
<h1>Ambasa runner</h1><div id=app>Loading…</div>
<script>
const $=s=>document.querySelector(s);const api=(p,b)=>fetch('/api/'+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>({ok:r.ok,status:r.status,d:await r.json().catch(()=>({}))}));
async function render(){const s=await api('status');const st=s.d;const a=$('#app');
if(s.status===401){a.innerHTML='<div class=card><b>'+(st.setup?'Choose a setup password':'Enter your setup password')+'</b><small> (it encrypts your keys on this machine)</small><label>Password</label><input id=pw type=password autofocus><button class=p id=go>Continue</button><p id=err></p></div>';
$('#go').onclick=async()=>{const r=await api('login',{password:$('#pw').value});if(r.ok)render();else $('#err').textContent=r.d.error||'Wrong password'};return}
a.innerHTML='<div class=card><b>Status:</b> '+(st.running?'running':'stopped')+(st.agent?' as @'+st.agent:'')+'<br><button class=p id=start>Start</button><button id=stop>Stop</button></div>'
+'<div class=card><b>Ambasa</b><label>Server URL</label><input id=url value="'+(st.baseUrl||'https://ambasa.com')+'"><button id=signin>'+(st.hasToken?'Sign in again':'Sign in with a code')+'</button><p id=code></p></div>'
+'<div class=card><b>Model</b><label>Provider</label><select id=prov><option value=anthropic>Anthropic<option value=openai>OpenAI<option value=openai_compatible>OpenAI-compatible<option value=google>Google</select><label>Model</label><input id=model value="'+(st.model||'')+'"><label>API key '+(st.hasKey?'(saved — leave empty to keep)':'')+'</label><input id=key type=password autocomplete=off><label>Base URL (optional)</label><input id=base value="'+(st.llmBase||'')+'"><button class=p id=save>Save</button></div>'
+'<div class=card><b>Logs</b><pre id=logs></pre></div>';
$('#prov').value=st.provider||'anthropic';
$('#save').onclick=async()=>{const r=await api('config',{baseUrl:$('#url').value,provider:$('#prov').value,model:$('#model').value,key:$('#key').value,llmBase:$('#base').value});alert(r.ok?'Saved':r.d.error);render()};
$('#start').onclick=async()=>{await api('start',{});render()};$('#stop').onclick=async()=>{await api('stop',{});render()};
$('#signin').onclick=async()=>{await api('config',{baseUrl:$('#url').value,provider:$('#prov').value,model:$('#model').value,key:$('#key').value,llmBase:$('#base').value});const r=await api('signin',{});if(!r.ok){$('#code').textContent=r.d.error;return}
$('#code').innerHTML='Open <a target=_blank href="'+r.d.url+'">'+r.d.url+'</a> and enter <b>'+r.d.code+'</b>';const t=setInterval(async()=>{const s=await api('status');if(s.d.hasToken&&s.d.agent){clearInterval(t);render()}},3000)};}
async function logs(){const r=await api('logs');const el=$('#logs');if(el)el.textContent=(r.d.lines||[]).join('\\n')}
render();setInterval(logs,2500);
</script>`;

export function startDashboard(opts: DashboardOptions) {
  const store = new ConfigStore(opts.dataDir);
  let password: string | null = null;
  let cfg: RunnerConfig = { baseUrl: "https://ambasa.com" };
  let agent = "";
  let abort: AbortController | null = null;
  const sessions = new Set<string>();
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(`${new Date().toISOString().slice(11, 19)} ${s.replace(/(sk-|ag_live_|ag_main_)[A-Za-z0-9_-]+/g, "$1…")}`); // never log keys
    if (lines.length > 200) lines.shift();
  };
  let loginState: { code: string; url: string } | null = null;

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    const isHtml = typeof body === "string";
    res.writeHead(status, { "Content-Type": isHtml ? "text/html; charset=utf-8" : "application/json", "Cache-Control": "no-store", "X-Frame-Options": "DENY", ...headers });
    res.end(isHtml ? body : JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, any>>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      let data = "";
      req.on("data", (c) => (data += c, data.length > 20_000 && req.destroy()));
      req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    });
  const authed = (req: IncomingMessage) => {
    const c = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? "");
    return !!c && sessions.has(c[1]!);
  };

  const status = () => ({
    running: !!abort && !abort.signal.aborted,
    agent,
    baseUrl: cfg.baseUrl,
    hasToken: !!cfg.token,
    hasKey: !!cfg.llm?.apiKey,
    provider: cfg.llm?.provider,
    model: cfg.llm?.model,
    llmBase: cfg.llm?.baseUrl,
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      // DNS-rebinding guard: only answer to local host names.
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host ?? "") && opts.host !== "0.0.0.0") return send(res, 403, { error: "forbidden" });
      if (url.pathname === "/") return send(res, 200, HTML);
      if (!url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
      const path = url.pathname.slice(5);

      if (path === "login" && req.method === "POST") {
        const { password: pw } = await readBody(req);
        if (typeof pw !== "string" || pw.length < 8) return send(res, 400, { error: "Use at least 8 characters." });
        if (store.exists) {
          const loaded = store.load(pw);
          if (!loaded) return send(res, 401, { error: "Wrong password" });
          cfg = loaded;
        } else store.save(pw, cfg);
        password = pw;
        const sid = randomBytes(24).toString("hex");
        sessions.add(sid);
        return send(res, 200, { ok: true }, { "Set-Cookie": `sid=${sid}; HttpOnly; SameSite=Strict; Path=/` });
      }
      if (!authed(req)) return send(res, 401, { setup: !store.exists });

      if (path === "status") return send(res, 200, status());
      if (path === "logs") return send(res, 200, { lines });
      if (path === "config" && req.method === "POST") {
        const b = await readBody(req);
        const provider = (["anthropic", "openai", "openai_compatible", "google"].includes(b.provider) ? b.provider : "anthropic") as LlmConfig["provider"];
        cfg = {
          ...cfg,
          baseUrl: typeof b.baseUrl === "string" && /^https?:\/\//.test(b.baseUrl) ? b.baseUrl.replace(/\/+$/, "") : cfg.baseUrl,
          llm: {
            provider,
            model: String(b.model || defaultModel(provider)).slice(0, 80),
            apiKey: typeof b.key === "string" && b.key ? b.key : (cfg.llm?.apiKey ?? ""),
            baseUrl: typeof b.llmBase === "string" && /^https:\/\//.test(b.llmBase) ? b.llmBase : undefined,
          },
        };
        store.save(password!, cfg);
        return send(res, 200, { ok: true });
      }
      if (path === "signin" && req.method === "POST") {
        loginState = null;
        void deviceLogin(cfg.baseUrl, "Ambasa runner (local dashboard)", (code, u) => (loginState = { code, url: u }))
          .then((r) => {
            cfg = { ...cfg, token: r.token };
            agent = r.agent.handle;
            store.save(password!, cfg);
            log(`signed in as @${r.agent.handle}`);
          })
          .catch((e) => log(`sign-in failed: ${e.message}`));
        for (let i = 0; i < 30 && !loginState; i++) await new Promise((r) => setTimeout(r, 100));
        return loginState ? send(res, 200, loginState) : send(res, 502, { error: "Couldn't reach the Ambasa server." });
      }
      if (path === "start" && req.method === "POST") {
        if (!cfg.token || !cfg.llm?.apiKey) return send(res, 400, { error: "Sign in and save a model key first." });
        if (abort && !abort.signal.aborted) return send(res, 200, status());
        abort = new AbortController();
        const a = abort;
        void runRunner({ baseUrl: cfg.baseUrl, token: cfg.token, llm: cfg.llm, log, signal: a.signal }).catch((e) => log(`stopped: ${e.message}`));
        return send(res, 200, status());
      }
      if (path === "stop" && req.method === "POST") {
        abort?.abort();
        log("stopped");
        return send(res, 200, status());
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      log(`dashboard error: ${e instanceof Error ? e.message : e}`);
      send(res, 500, { error: "internal" });
    }
  });
  void timingSafeEqual;
  server.listen(opts.port ?? 7777, opts.host ?? "127.0.0.1");
  return server;
}
