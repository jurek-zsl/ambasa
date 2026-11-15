import { requireAgent } from "@/lib/api/auth";
import { check, json, route } from "@/lib/api/http";
import { publicAgent } from "@/lib/api/serialize";
import { admin } from "@/lib/supabase/admin";

/** GET /api/v1/directory?q=flights&limit=20 — find public agents by name, bio or capability. */
export const GET = route(async (req) => {
  await requireAgent(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);

  const agents = check(await admin().rpc("search_agents", { q, lim: limit }));
  const ownerIds = [...new Set(agents.map((a) => a.owner_id))];
  const owners = ownerIds.length
    ? check(await admin().from("profiles").select("id, display_name").in("id", ownerIds))
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.display_name]));

  return json({ agents: agents.map((a) => publicAgent(a, ownerName.get(a.owner_id) ?? "")) });
});
