import { configFromEnv } from "./config";
import { startDashboard } from "./dashboard";
import { deviceLogin } from "./device-login";
import { runRunner } from "./runner";
import { runWorker } from "./worker";
import { generateVaultKeys } from "@ambasa/shared";

const [cmd = "help", ...rest] = process.argv.slice(2);
const arg = (name: string) => rest.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const HELP = `ambasa-runner <command>

  run          Run an agent with the settings in AMBASA_TOKEN, AMBASA_LLM_PROVIDER, AMBASA_LLM_KEY (and optionally
               AMBASA_URL, AMBASA_LLM_MODEL, AMBASA_LLM_BASE_URL). Connects outbound only.
  dashboard    Local setup UI on http://127.0.0.1:7777 (--port=, --data=). Needs a setup password.
  login        Link this machine to an agent with a device code and print the token.
  worker       Hosted mode worker (needs SUPABASE_URL, SUPABASE_SECRET_KEY, AMBASA_URL, WORKER_SECRET, VAULT_PUBLIC_KEY, VAULT_PRIVATE_KEY).
  keygen       Create the worker's key pair for the key vault.
`;

async function main() {
  switch (cmd) {
    case "run": {
      const cfg = configFromEnv();
      if (!cfg?.token || !cfg.llm) return fail("Set AMBASA_TOKEN, AMBASA_LLM_PROVIDER and AMBASA_LLM_KEY.");
      const ctrl = new AbortController();
      process.on("SIGINT", () => ctrl.abort());
      process.on("SIGTERM", () => ctrl.abort());
      return runRunner({ baseUrl: cfg.baseUrl, token: cfg.token, llm: cfg.llm, signal: ctrl.signal });
    }
    case "dashboard": {
      const port = Number(arg("port") ?? process.env.PORT ?? 7777);
      const host = process.env.AMBASA_DASHBOARD_HOST ?? "127.0.0.1"; // bind to 127.0.0.1 unless you really mean otherwise
      startDashboard({ dataDir: arg("data") ?? process.env.AMBASA_DATA ?? "./data", port, host });
      console.log(`Ambasa runner dashboard on http://${host}:${port}`);
      return;
    }
    case "login": {
      const base = process.env.AMBASA_URL ?? "https://ambasa.com";
      const r = await deviceLogin(base, "ambasa-runner CLI", (code, url) => console.log(`Open ${url} and enter: ${code}`));
      console.log(`\nLinked to @${r.agent.handle}. Token (shown once):\n${r.token}`);
      return;
    }
    case "worker": {
      const need = (n: string) => process.env[n] ?? fail(`Missing ${n}`);
      const ctrl = new AbortController();
      process.on("SIGTERM", () => ctrl.abort());
      return runWorker(
        {
          supabaseUrl: need("SUPABASE_URL"),
          supabaseSecretKey: need("SUPABASE_SECRET_KEY"),
          ambasaUrl: need("AMBASA_URL"),
          workerSecret: need("WORKER_SECRET"),
          keys: { publicKey: need("VAULT_PUBLIC_KEY"), privateKey: need("VAULT_PRIVATE_KEY") },
        },
        ctrl.signal,
      );
    }
    case "keygen": {
      const k = generateVaultKeys();
      console.log(`VAULT_PUBLIC_KEY=${k.publicKey}\nVAULT_PRIVATE_KEY=${k.privateKey}\n\nPut the public key in the web app as WORKER_PUBLIC_KEY.\nKeep the private key only on the worker, and back it up off the box.`);
      return;
    }
    default:
      console.log(HELP);
  }
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
