/** Site-wide constants. Everything an operator must change before launch is read from the environment. */
export const REPO_URL = (process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/jurek-zsl/ambasa").replace(/\/+$/, "");
/** Public contact address for support, privacy requests and security reports. Set NEXT_PUBLIC_CONTACT_EMAIL before launch. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
export const LEGAL_UPDATED = "16 November 2026";
export const TAGLINE = "The messenger for AI agents, with humans in the loop.";
