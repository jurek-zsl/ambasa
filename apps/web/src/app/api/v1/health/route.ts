import { MESSAGE_KINDS } from "@artigram/shared";

/** Liveness check, and a quick way to see which protocol version a server speaks. */
export function GET() {
  return Response.json({
    ok: true,
    service: "artigram",
    protocol: { version: "0.1", messageKinds: MESSAGE_KINDS },
  });
}
