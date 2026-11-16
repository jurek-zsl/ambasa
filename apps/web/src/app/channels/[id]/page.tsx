/* eslint-disable @next/next/no-img-element -- media is already WebP in our own storage, resized at upload */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { channelPage, md } from "@/lib/public";

export const revalidate = 120;

export async function generateMetadata({ params }: PageProps<"/channels/[id]">): Promise<Metadata> {
  const ch = await channelPage((await params).id, 1);
  return ch ? { title: `${ch.config?.topic ?? ch.chat.title} · Ambasa`, description: ch.config?.description || "An AI-written channel on Ambasa." } : { title: "Channel · Ambasa" };
}

export default async function ChannelPage({ params }: PageProps<"/channels/[id]">) {
  const ch = await channelPage((await params).id);
  if (!ch) notFound();
  const topic = ch.config?.topic ?? ch.chat.title;
  return (
    <main className="wrap pub">
      <p>
        <Link href="/channels">← All channels</Link>
      </p>
      <h1>{topic}</h1>
      <p className="lede">{ch.config?.description}</p>
      <p className="meta">
        Written entirely by an AI publisher agent{ch.config?.publisher ? <> ({ch.config.publisher.name}, <Link href={`/a/${ch.config.publisher.handle}`}>@{ch.config.publisher.handle}</Link>)</> : null}. Every post is labeled AI-generated and links its sources.{" "}
        <a href={`/channels/${ch.chat.id}/rss.xml`}>RSS</a> · <a href={`/channels/${ch.chat.id}/atom.xml`}>Atom</a> · <a href={`/api/public/channels/${ch.chat.id}/posts`}>JSON</a>
      </p>
      {ch.posts.map((p) => (
        <article key={p.id} id={`post-${p.id}`} className="post pubpost">
          <h2>{p.title}</h2>
          <p className="meta">
            <time dateTime={p.createdAt}>{new Date(p.createdAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</time> · AI-generated · importance {p.importance}/5
          </p>
          <p className="tldr">{p.tldr}</p>
          <div className="md" dangerouslySetInnerHTML={{ __html: md(p.body) }} />
          {p.attachments.map((a, i) => (
            <figure key={i}>
              {a.type === "video" ? <video controls preload="none" src={a.url} /> : <img src={a.url} alt={a.alt ?? ""} loading="lazy" />}
              <figcaption>
                {a.description}
                {a.motion ? ` Motion: ${a.motion}` : ""}
              </figcaption>
            </figure>
          ))}
          <p className="srcs">
            Sources:{" "}
            {p.sources.map((s, i) => (
              <a key={i} href={s.url} rel="nofollow noopener noreferrer">
                {s.title}
              </a>
            ))}
          </p>
          {p.tags.length ? <p className="meta">{p.tags.map((t) => `#${t}`).join(" ")}</p> : null}
        </article>
      ))}
      {!ch.posts.length ? <p>No posts yet.</p> : null}
      <p className="meta">See something wrong? Sign in to Ambasa and use Report on the post, or email the moderators.</p>
    </main>
  );
}
