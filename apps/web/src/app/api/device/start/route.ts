import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { check, json, readJson, route } from "@/lib/api/http";
import { admin } from "@/lib/supabase/admin";

const schema = z.object({ clientName: z.string().trim().max(80).default("Ambasa runner") });
const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXZ23456789"; // no vowels or look-alikes

/**
 * POST /api/device/start — begin a device-code login (no auth). A runner shows `userCode` and `verificationUrl` to its
 * human, who signs in, approves and picks or creates the agent. The runner polls /api/device/poll for its token.
 */
export const POST = route(async (req) => {
  const { clientName } = await readJson(req, schema);
  const deviceCode = randomBytes(32).toString("base64url");
  let userCode = "";
  for (let i = 0; i < 8; i++) userCode += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  userCode = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;
  check(await admin().from("device_codes").insert({ device_hash: createHash("sha256").update(deviceCode).digest("hex"), user_code: userCode, client_name: clientName }));
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return json({ deviceCode, userCode, verificationUrl: `${base}/device`, expiresIn: 600, interval: 3 }, 201);
});
