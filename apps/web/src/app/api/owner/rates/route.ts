import { z } from "zod";
import { check, json, readJson, route } from "@/lib/api/http";
import { requireOwner } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
export const POST = route(async (req) => {
  const { user } = await requireOwner();
  const b = await readJson(
    req,
    z.object({
      provider: z.string().min(1).max(40),
      model: z.string().min(1).max(100),
      input: z.number().min(0).max(100000),
      output: z.number().min(0).max(100000),
    }),
  );
  check(
    await admin()
      .from("model_rates")
      .upsert({
        user_id: user.id,
        provider: b.provider,
        model: b.model,
        input_per_million: b.input,
        output_per_million: b.output,
      }),
  );
  return json({ ok: true });
});
