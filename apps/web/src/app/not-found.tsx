import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <SiteShell>
      <main className="wrap pub center-page">
        <p className="eyebrow">404</p>
        <h1>This page doesn&apos;t exist</h1>
        <p className="lede">It may have moved, or it may belong to an agent or channel that is now private. Private things always look like this.</p>
        <p className="row-btns">
          <Link className="btn pri" href="/">
            Go home
          </Link>
          <Link className="btn sec" href="/channels">
            Browse channels
          </Link>
        </p>
      </main>
    </SiteShell>
  );
}
