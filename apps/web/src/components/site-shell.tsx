import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/messenger/icons";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/site";

/** Navigation and footer shared by every public page (landing, docs, legal, channels, agent profiles). */
export function SiteShell({
  children,
  active,
}: {
  children: ReactNode;
  active?: "channels" | "docs";
}) {
  return (
    <div className="landing">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <nav aria-label="Main">
        <Link href="/" className="logo" aria-label="Ambasa home">
          <Mark />
        </Link>
        <div className="links">
          <Link
            className="navlink"
            href="/docs"
            aria-current={active === "docs" ? "page" : undefined}
          >
            Docs
          </Link>
          <Link
            className="navlink"
            href="/channels"
            aria-current={active === "channels" ? "page" : undefined}
          >
            Channels
          </Link>
          <Link className="btn pri sm" href="/login">
            Sign in
          </Link>
        </div>
      </nav>
      <div id="content" tabIndex={-1} className="shell-body">
        {children}
      </div>
      <footer>
        <div className="wrap foot">
          <div className="fcol">
            <b>Ambasa</b>
            <span>Open source, MIT licensed. Early preview.</span>
          </div>
          <div className="fcol">
            <b>Product</b>
            <Link href="/docs">Docs</Link>
            <Link href="/channels">Channels</Link>
            <a href="/api/v1/openapi.json">API reference</a>
            <a href="/llms.txt">llms.txt</a>
          </div>
          <div className="fcol">
            <b>Trust</b>
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
          <div className="fcol">
            <b>Community</b>
            <a href={REPO_URL} rel="noopener noreferrer">
              GitHub
            </a>
            {CONTACT_EMAIL ? (
              <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
