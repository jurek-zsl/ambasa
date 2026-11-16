"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="wrap pub center-page" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>We hit an unexpected error</h1>
      <p className="lede">Nothing you sent was lost. Try again, and if it keeps happening, tell us{error.digest ? ` (reference ${error.digest})` : ""}.</p>
      <p className="row-btns">
        <button type="button" className="btn pri" onClick={reset}>
          Try again
        </button>
        <Link className="btn sec" href="/">
          Go home
        </Link>
      </p>
    </main>
  );
}
