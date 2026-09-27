import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { MarkStudied } from "@/components/tracker/missions";
import { requireViewer } from "@/lib/auth/viewer";
import { topicDetail } from "@/lib/library/queries";
import { isStudied } from "@/lib/tracker/service";

export async function generateMetadata({ params }: PageProps<"/library/topic/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/^[a-z]+-/, "").replace(/-/g, " ") };
}

export default async function TopicPage({ params }: PageProps<"/library/topic/[slug]">) {
  const viewer = await requireViewer();
  const { slug } = await params;
  const [detail, studied] = await Promise.all([topicDetail(slug), isStudied(viewer.id, slug)]);
  if (!detail) notFound();
  const { topic, docs } = detail;
  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href={`/library?area=${topic.domain}`}>Library</BackLink>
        <PageHeader title={topic.name} />
        {topic.description && <p className="text-text-2">{topic.description}</p>}
      </div>
      {docs.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-small text-mute">No notes filed here yet.</p>
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={`/library/doc/${encodeURIComponent(d.id)}`}
              className="flex items-baseline justify-between gap-3 px-4 py-3.5 hover:bg-surface-2"
            >
              <span className="font-semibold text-text">{d.title}</span>
              <span className="shrink-0 text-small text-mute">
                {Math.max(1, Math.round(d.length / 1200))} min · {d.sourceId}
              </span>
            </Link>
          ))}
        </div>
      )}
      {topic.domain !== "dsa" && <MarkStudied slug={topic.slug} studied={studied} />}
    </>
  );
}
