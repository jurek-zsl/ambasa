import { z } from "zod";
import { check, json, maybe, readJson, route } from "@/lib/api/http";
import { requireOwnedAgent } from "@/lib/api/owner";
import { admin } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

const schema = z.object({
  provider: z.enum(["anthropic", "openai", "openai_compatible", "google"]),
  model: z.string().trim().min(1).max(80),
  baseUrl: z.url({ protocol: /^https$/ }).optional(),
  /** The key, sealed to the worker's public key in the browser (libsodium sealed box, base64). Never plaintext. */
  ciphertext: z.string().min(40).max(4096),
  /** Last four characters, so the owner can recognise the key. */
  hint: z.string().max(8).default(""),
});

/**
 * PUT /api/owner/agents/:id/key — store a model key for hosted mode. Write-only: only ciphertext reaches us, and
 * it is never returned to a browser. Only the worker's private key (on the VPS) can open it.
 */
export const PUT = route(
  async (req, ctx: RouteContext<"/api/owner/agents/[id]/key">) => {
    const { user } = await requireOwner();
    const agent = await requireOwnedAgent(user.id, (await ctx.params).id);
    const k = await readJson(req, schema);
    check(
      await admin()
        .from("agent_secrets")
        .upsert({
          agent_id: agent.id,
          provider: k.provider,
          model: k.model,
          base_url: k.baseUrl ?? null,
          ciphertext: k.ciphertext,
          hint: k.hint,
        }),
    );
    check(await admin().from("agent_checks").delete().eq("agent_id", agent.id));
    check(
      await admin()
        .from("agents")
        .update({ model: k.model })
        .eq("id", agent.id),
    );
    return json({
      key: { provider: k.provider, model: k.model, hint: k.hint },
    });
  },
);

/** GET — whether a key is set (never the key). */
export const GET = route(
  async (_req, ctx: RouteContext<"/api/owner/agents/[id]/key">) => {
    const { user } = await requireOwner();
    const agent = await requireOwnedAgent(user.id, (await ctx.params).id);
    const row = maybe(
      await admin()
        .from("agent_secrets")
        .select("provider, model, hint, created_at")
        .eq("agent_id", agent.id)
        .maybeSingle(),
    );
    return json({ key: row });
  },
);

export const DELETE = route(
  async (_req, ctx: RouteContext<"/api/owner/agents/[id]/key">) => {
    const { user } = await requireOwner();
    const agent = await requireOwnedAgent(user.id, (await ctx.params).id);
    check(
      await admin().from("agent_secrets").delete().eq("agent_id", agent.id),
    );
    check(await admin().from("agent_checks").delete().eq("agent_id", agent.id));
    return json({ ok: true });
  },
);
