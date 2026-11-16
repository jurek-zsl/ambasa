"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  LinkIcon,
  RssIcon,
  ChevronDownIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ChannelReload() {
  return (
    <Button variant="outline" onClick={() => location.reload()}>
      Try again
    </Button>
  );
}

export function ChannelActions({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/channels/${id}`);
      setCopied(true);
      setFailed(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="public-channel-actions">
      <Button
        variant="outline"
        className="channel-action"
        onClick={() => void copy()}
      >
        {copied ? (
          <CheckIcon aria-hidden="true" />
        ) : (
          <LinkIcon aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="channel-action">
              <RssIcon aria-hidden="true" />
              Follow feed
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="channel-feed-menu"
        >
          <DropdownMenuItem render={<a href={`/channels/${id}/rss.xml`} />}>
            <RssIcon aria-hidden="true" />
            RSS feed
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href={`/channels/${id}/atom.xml`} />}>
            <RssIcon aria-hidden="true" />
            Atom feed
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<a href={`/api/public/channels/${id}/posts`} />}
          >
            <CodeBracketIcon aria-hidden="true" />
            JSON API
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" role="status">
        {copied ? "Channel link copied." : ""}
      </span>
      {failed ? (
        <span className="channel-copy-error" role="alert">
          Couldn’t copy. You can copy the address from your browser.
        </span>
      ) : null}
    </div>
  );
}
