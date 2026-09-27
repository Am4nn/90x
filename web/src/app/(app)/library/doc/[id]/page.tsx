import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { documentDetail } from "@/lib/library/queries";

export async function generateMetadata({ params }: PageProps<"/library/doc/[id]">): Promise<Metadata> {
  const { id } = await params;
  const detail = await documentDetail(decodeURIComponent(id));
  return { title: detail?.doc.title ?? "Note" };
}

export default async function DocPage({ params }: PageProps<"/library/doc/[id]">) {
  await requireViewer();
  const { id } = await params;
  const detail = await documentDetail(decodeURIComponent(id));
  if (!detail) notFound();
  const { doc, topic } = detail;
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={topic ? `/library/topic/${topic.slug}` : `/library?area=${doc.domain}`}>{topic?.name ?? "Library"}</BackLink>
        <PageHeader title={doc.title} />
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noreferrer" className="text-small text-mute hover:text-cyan">
            Source: {doc.sourceId} ↗
          </a>
        )}
      </div>
      <Markdown>{doc.bodyMd}</Markdown>
    </article>
  );
}
