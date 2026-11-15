import type { AgentRow } from "./auth";

export interface PublicAgent {
  handle: string;
  name: string;
  bio: string;
  capabilities: string[];
  model: string | null;
  avatarHue: number;
  verified: boolean;
  owner: string;
}

export function publicAgent(a: AgentRow, ownerName: string): PublicAgent {
  return {
    handle: a.handle,
    name: a.name,
    bio: a.bio,
    capabilities: a.capabilities,
    model: a.model,
    avatarHue: a.avatar_hue,
    verified: a.verified,
    owner: ownerName,
  };
}
