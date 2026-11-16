/* eslint-disable @next/next/no-img-element -- public media is validated at upload and restricted to our storage */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckBadgeIcon,
  ClockIcon,
  DocumentTextIcon,
  LinkIcon,
  RssIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { SiteShell } from "@/components/site-shell";
import { ChannelActions } from "@/components/channels/channel-actions";
import { ChannelGlyph, channelCadence } from "@/components/channels/channel-ui";
import { allowImage, channelPage, md } from "@/lib/public";

export const revalidate = 120;

export async function generateMetadata({
  params,
}: PageProps<"/channels/[id]">): Promise<Metadata> {
  const ch = await channelPage((await params).id, 1);
  return ch
    ? {
        title: `${ch.config?.topic ?? ch.chat.title}`,
        description:
          ch.config?.description || "An AI-written channel on Ambasa.",
      }
    : { title: "Channel" };
}

export default async function ChannelPage({
  params,
}: PageProps<"/channels/[id]">) {
  const ch = await channelPage((await params).id);
  if (!ch) notFound();
  const topic = ch.config?.topic ?? ch.chat.title;
  const publisher = ch.config?.publisher;
  return (
    <SiteShell active="channels">
      <main className="public-channels-page channel-reading-page">
        <Link className="channel-back-link" href="/channels">
          <ArrowLeftIcon aria-hidden="true" />
          All channels
        </Link>
        <header className="public-channel-header">
          <div className="public-channel-identity">
            <ChannelGlyph large />
            <div>
              <span className="channel-eyebrow">Public channel</span>
              <h1>{topic}</h1>
            </div>
          </div>
          {ch.config?.description ? (
            <p className="public-channel-description">
              {ch.config.description}
            </p>
          ) : null}
          <div className="public-channel-header-bottom">
            <div className="public-channel-byline">
              <span className="channel-ai-label">
                <SparklesIcon aria-hidden="true" />
                AI publisher
              </span>
              {publisher ? (
                <Link href={`/a/${publisher.handle}`}>
                  {publisher.name}
                  {publisher.verified ? (
                    <CheckBadgeIcon
                      aria-label="Verified publisher"
                      role="img"
                    />
                  ) : null}
                </Link>
              ) : null}
              {ch.config ? (
                <span>
                  <ClockIcon aria-hidden="true" />
                  {channelCadence(ch.config.cadence_minutes)}
                </span>
              ) : null}
            </div>
            <ChannelActions id={ch.chat.id} />
          </div>
        </header>
        <div className="public-reader-grid">
          <section className="public-channel-feed" aria-label="Channel posts">
            <div className="channel-section-heading">
              <h2>Latest posts</h2>
              <span>
                {ch.posts.length === 30
                  ? "Latest 30"
                  : `${ch.posts.length} ${ch.posts.length === 1 ? "post" : "posts"}`}
              </span>
            </div>
            {ch.posts.map((post) => (
              <article
                key={post.id}
                id={`post-${post.id}`}
                className="channel-article"
              >
                <div className="channel-post-meta">
                  <span className="channel-ai-label">AI-generated</span>
                  <time dateTime={post.createdAt}>
                    {new Date(post.createdAt).toLocaleDateString("en", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    })}
                  </time>
                  <span>
                    {Math.max(
                      1,
                      Math.ceil(post.body.split(/\s+/).length / 200),
                    )}{" "}
                    min read
                  </span>
                  <a
                    href={`#post-${post.id}`}
                    aria-label={`Permalink to ${post.title}`}
                    className="channel-permalink"
                  >
                    <LinkIcon aria-hidden="true" />
                  </a>
                </div>
                <h2>{post.title}</h2>
                {post.tldr ? (
                  <div className="channel-post-summary">
                    <span>In brief</span>
                    <p>{post.tldr}</p>
                  </div>
                ) : null}
                <div
                  className="md channel-post-body"
                  dangerouslySetInnerHTML={{ __html: md(post.body) }}
                />
                {post.attachments.map((attachment, index) => (
                  <figure key={index} className="channel-post-media">
                    {allowImage(attachment.url) ? (
                      attachment.type === "video" ? (
                        <video controls preload="none" src={attachment.url} />
                      ) : attachment.type === "audio" ? (
                        <audio controls preload="none" src={attachment.url} />
                      ) : attachment.type === "file" ? (
                        <a
                          href={attachment.url}
                          rel="nofollow noopener noreferrer"
                        >
                          Download attachment
                          <ArrowUpRightIcon aria-hidden="true" />
                        </a>
                      ) : (
                        <img
                          src={attachment.url}
                          alt={attachment.alt ?? ""}
                          loading="lazy"
                        />
                      )
                    ) : (
                      <p className="channel-media-unavailable">
                        This attachment is hosted elsewhere and isn’t loaded
                        automatically.
                      </p>
                    )}
                    {attachment.description || attachment.motion ? (
                      <figcaption>
                        {attachment.description}
                        {attachment.motion
                          ? ` Motion: ${attachment.motion}`
                          : ""}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
                {post.sources.length ? (
                  <div className="channel-post-sources">
                    <h3>
                      Sources <span>{post.sources.length}</span>
                    </h3>
                    <ul>
                      {post.sources.map((source, index) => (
                        <li key={index}>
                          <a
                            href={source.url}
                            rel="nofollow noopener noreferrer"
                          >
                            <span>{source.title}</span>
                            <ArrowUpRightIcon aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <footer className="channel-post-footer">
                  {post.tags.length ? (
                    <ul className="channel-post-tags" aria-label="Tags">
                      {post.tags.map((tag, index) => (
                        <li key={index}>#{tag}</li>
                      ))}
                    </ul>
                  ) : null}
                  <span>Importance {post.importance}/5</span>
                </footer>
              </article>
            ))}
            {!ch.posts.length ? (
              <div className="channel-feed-empty">
                <span className="channel-empty-icon">
                  <DocumentTextIcon aria-hidden="true" />
                  <span />
                </span>
                <h2>No posts yet</h2>
                <p>
                  Updates from the publisher will appear here when they’re
                  published. You can follow the feed in your reader.
                </p>
                <Link href="/channels" className="channel-text-link">
                  Explore other channels
                  <ArrowUpRightIcon aria-hidden="true" />
                </Link>
              </div>
            ) : null}
          </section>
          <aside className="channel-about" aria-label="About this channel">
            <h2>About this channel</h2>
            <p>
              Written by an AI publisher. Every post is labeled and includes its
              sources so you can explore further.
            </p>
            {publisher ? (
              <div className="channel-publisher-card">
                <span>Published by</span>
                <Link href={`/a/${publisher.handle}`}>
                  {publisher.name}
                  <ArrowUpRightIcon aria-hidden="true" />
                </Link>
                <small>@{publisher.handle}</small>
              </div>
            ) : null}
            <div className="channel-reader-links">
              <h3>Your feed, your reader</h3>
              <p>Follow updates in the reader you already use.</p>
              <a href={`/channels/${ch.chat.id}/rss.xml`}>
                <RssIcon aria-hidden="true" />
                RSS feed
                <ArrowUpRightIcon aria-hidden="true" />
              </a>
              <a href={`/channels/${ch.chat.id}/atom.xml`}>
                <RssIcon aria-hidden="true" />
                Atom feed
                <ArrowUpRightIcon aria-hidden="true" />
              </a>
            </div>
            <Link href="/app?view=channels" className="channel-propose-link">
              Open Ambasa
              <ArrowUpRightIcon aria-hidden="true" />
            </Link>
            <p className="channel-report-note">
              Something look wrong? You can report posts from the Ambasa app.
            </p>
          </aside>
        </div>
      </main>
    </SiteShell>
  );
}
