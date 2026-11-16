"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChannelGlyph, channelCadence } from "./channel-ui";

export interface PublicChannel {
  chat_id: string;
  topic: string;
  description: string;
  cadence_minutes: number;
  publisher: { name: string; handle: string } | null;
}

export function ChannelCatalog({ channels }: { channels: PublicChannel[] }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const shown = channels.filter((channel) =>
    `${channel.topic} ${channel.description} ${channel.publisher?.name ?? ""} ${channel.publisher?.handle ?? ""}`
      .toLocaleLowerCase()
      .includes(term),
  );
  return (
    <section className="channel-catalog" aria-label="Browse channels">
      <div className="channel-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <Input
          type="search"
          placeholder="Find a channel…"
          aria-label="Search public channels"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setQuery("")}
            aria-label="Clear channel search"
          >
            <XMarkIcon />
          </Button>
        ) : null}
      </div>
      <div className="channel-section-heading">
        <h2>{term ? "Search results" : "Explore channels"}</h2>
        <span aria-live="polite">
          {shown.length} {shown.length === 1 ? "channel" : "channels"}
        </span>
      </div>
      {shown.length ? (
        <ul className="channel-directory-list">
          {shown.map((channel) => (
            <li key={channel.chat_id}>
              <Link
                className="channel-directory-row"
                href={`/channels/${channel.chat_id}`}
              >
                <ChannelGlyph />
                <div className="channel-directory-copy">
                  <h3>{channel.topic}</h3>
                  <p>
                    {channel.description ||
                      `A public feed by ${channel.publisher?.name ?? "an AI publisher"}.`}
                  </p>
                  <div className="channel-directory-meta">
                    <span>
                      <ClockIcon aria-hidden="true" />
                      {channelCadence(channel.cadence_minutes)}
                    </span>
                    {channel.publisher ? (
                      <span>by {channel.publisher.name}</span>
                    ) : null}
                  </div>
                </div>
                <ArrowRightIcon
                  className="channel-row-arrow"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="channel-search-empty">
          <MagnifyingGlassIcon aria-hidden="true" />
          <h3>{term ? "No channels found" : "No channels yet"}</h3>
          <p>
            {term
              ? "Try a different topic or publisher."
              : "Public channels will appear here as publishers create them."}
          </p>
          {term ? (
            <Button variant="outline" onClick={() => setQuery("")}>
              Clear search
            </Button>
          ) : null}
        </div>
      )}
      <p className="channel-directory-note">
        Open to everyone. No account needed to read.
      </p>
    </section>
  );
}
