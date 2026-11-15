import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  chats: () => (
    <Svg>
      <path d="M4.5 6.5a2 2 0 012-2h11a2 2 0 012 2v8a2 2 0 01-2 2H10l-4.5 3.5v-3.5h0a1 1 0 01-1-1z" />
    </Svg>
  ),
  shield: () => (
    <Svg>
      <path d="M12 3l7.5 3v5.5c0 4.8-3.3 8-7.5 9.5-4.2-1.5-7.5-4.7-7.5-9.5V6z" />
      <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
    </Svg>
  ),
  alert: () => (
    <Svg>
      <path d="M12 3l7.5 3v5.5c0 4.8-3.3 8-7.5 9.5-4.2-1.5-7.5-4.7-7.5-9.5V6z" />
      <path d="M12 8.5v4M12 15.5v.01" />
    </Svg>
  ),
  compass: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.3 8.7l-1.9 4.7-4.7 1.9 1.9-4.7z" />
    </Svg>
  ),
  chip: () => (
    <Svg>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
      <path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21" />
    </Svg>
  ),
  search: () => (
    <Svg>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </Svg>
  ),
  task: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.4 2.4 4.6-5" />
    </Svg>
  ),
  group: () => (
    <Svg>
      <circle cx="9" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.4" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M14.5 14.6c2.6-.3 4.6 1 5.2 3.9" />
    </Svg>
  ),
  info: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.8v.01" />
    </Svg>
  ),
  back: () => (
    <Svg>
      <path d="M14.5 5.5L8 12l6.5 6.5" />
    </Svg>
  ),
  send: () => (
    <Svg>
      <path d="M5 12h12M12 6l6 6-6 6" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  plus: () => (
    <Svg>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  copy: () => (
    <Svg>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
    </Svg>
  ),
  pause: () => (
    <Svg>
      <path d="M9 5v14M15 5v14" />
    </Svg>
  ),
  play: () => (
    <Svg>
      <path d="M8 5.5l11 6.5-11 6.5z" />
    </Svg>
  ),
  eye: () => (
    <Svg>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  logout: () => (
    <Svg>
      <path d="M14 4.5h3.5a2 2 0 012 2v11a2 2 0 01-2 2H14" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </Svg>
  ),
};

/** There is no Ambasa logo yet, so the name itself is the mark. */
export function Mark() {
  return <span className="wordmark">Ambasa</span>;
}

export function Verified() {
  return (
    <svg className="vf" viewBox="0 0 16 16" role="img" aria-label="Verified">
      <path
        fill="var(--accent)"
        d="M8 .8l1.9 1.4 2.3-.1.7 2.2 1.9 1.4-.7 2.2.7 2.2-1.9 1.4-.7 2.2-2.3-.1L8 15.2l-1.9-1.4-2.3.1-.7-2.2L1.2 10.3l.7-2.2-.7-2.2 1.9-1.4.7-2.2 2.3.1z"
      />
      <path d="M5.3 8.1l1.8 1.8 3.6-3.8" stroke="var(--surface)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
