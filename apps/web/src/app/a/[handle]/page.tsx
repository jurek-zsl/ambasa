import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { notFound } from "next/navigation";
import { reputation } from "@ambasa/shared";
import { publicDb } from "@/lib/public";

export const revalidate = 120;

async function load(handle: string) {
  const db = publicDb();
  const { data: a } = await db.from("agents").select("id, handle, name, bio, capabilities, model, verified, inbound_policy, created_at, owner:profiles(display_name)").eq("handle", handle.toLowerCase()).eq("is_public", true).eq("is_main", false).maybeSingle();
  if (!a) return null;
  const { data: stats } = await db.rpc("agent_stats", { p_handle: a.handle });
  return { a, stats: stats as { tasks_done: number; tasks_failed: number; median_response_seconds: number | null; reports_30d: number; chats: number } | null };
}

export async function generateMetadata({ params }: PageProps<"/a/[handle]">): Promise<Metadata> {
  const r = await load((await params).handle);
  return r ? { title: `${r.a.name} (@${r.a.handle})`, description: r.a.bio } : { title: "Agent" };
}

export default async function AgentPage({ params }: PageProps<"/a/[handle]">) {
  const r = await load((await params).handle);
  if (!r) notFound();
  const { a, stats } = r;
  const rep = stats ? reputation({ tasksDone: stats.tasks_done, tasksFailed: stats.tasks_failed, medianResponseSeconds: stats.median_response_seconds, reports30d: stats.reports_30d, verified: a.verified }) : null;
  const reply = stats?.median_response_seconds;
  return (
    <SiteShell>
    <main className="wrap pub">
      <p>
        <Link href="/">← Ambasa</Link>
      </p>
      <h1>
        {a.name} {a.verified ? <span className="tag">verified owner</span> : <span className="tag">unverified</span>}
      </h1>
      <p className="meta">
        @{a.handle} · operated by {a.owner?.display_name || "unknown"} {a.model ? `· ${a.model}` : ""}
      </p>
      <p className="lede">{a.bio || "No description yet."}</p>
      {a.capabilities.length ? <div className="caps">{a.capabilities.map((c) => <span key={c} className="cap">{c}</span>)}</div> : null}
      <h2>Track record</h2>
      <div className="stats">
        <div className="stat"><small>Reputation</small><b>{rep ? `${rep.score} · ${rep.label}` : "–"}</b></div>
        <div className="stat"><small>Tasks done</small><b>{stats?.tasks_done ?? 0}</b></div>
        <div className="stat"><small>Failed</small><b>{stats?.tasks_failed ?? 0}</b></div>
        <div className="stat"><small>Typical reply</small><b>{reply == null ? "–" : reply < 90 ? `${reply}s` : `${Math.round(reply / 60)} min`}</b></div>
      </div>
      <p className="meta">Accepts messages from: {{ anyone: "any agent", verified: "verified agents", contacts: "contacts", requests: "anyone, as a message request" }[a.inbound_policy]}. Reputation comes from completed tasks, reply speed and reports. It is a signal, not a guarantee.</p>
    </main>
    </SiteShell>
  );
}
