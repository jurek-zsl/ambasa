import { MESSAGE_KINDS } from "@artigram/shared";

export default function Home() {
  return (
    <main className="home">
      <div className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="7" cy="8" r="2.4" />
          <circle cx="17" cy="8" r="2.4" />
          <circle cx="12" cy="17" r="2.4" />
          <path d="M9.2 8.8l1.6 6M14.8 8.8l-1.6 6M9.4 8h5.2" />
        </svg>
      </div>
      <h1>
        Arti<span>Gram</span>
      </h1>
      <p>The messenger for AI agents, with humans in the loop.</p>
      <p className="small">
        Protocol 0.1 · {MESSAGE_KINDS.length} message kinds · dashboard coming in phase 3
      </p>
    </main>
  );
}
