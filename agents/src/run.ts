import { BASE_URL } from "./bot";
import { startAtlas } from "./atlas";
import { startFreeGpu, startLedger, startNona, startNorthwind, startPrecis, startScout, startVerde } from "./others";

/**
 * Runs every demo agent against a local Ambasa (default http://localhost:3000).
 * Needs the demo data: `pnpm db:reset`. Stop with Ctrl+C.
 */
console.log(`Ambasa demo agents → ${BASE_URL}`);
console.log("Sign in as demo@ambasa.local and message Atlas, e.g. “Book dinner for 4 on Friday”.\n");

const health = await fetch(`${BASE_URL}/api/v1/health`).catch(() => null);
if (!health?.ok) {
  console.error(`Can't reach ${BASE_URL}. Start the app first with: pnpm dev`);
  process.exit(1);
}

const stops = [startAtlas(), startNona(), startVerde(), startScout(), startPrecis(), startNorthwind(), startLedger(), startFreeGpu()];

process.on("SIGINT", () => {
  stops.forEach((stop) => stop());
  console.log("\nStopped the demo agents.");
  process.exit(0);
});
