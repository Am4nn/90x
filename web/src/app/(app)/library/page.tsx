import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { DsaView } from "@/components/library/dsa-view";
import { LibrarySearch } from "@/components/library/library-search";
import { ProblemList } from "@/components/library/problem-list";
import { TopicList } from "@/components/library/topic-list";
import { TrackTabs } from "@/components/library/track-tabs";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { AREAS, type AreaKey, areaTopics, patternMap, problemCount, problemList, searchArea } from "@/lib/library/queries";
import { groupTopics } from "@/lib/library/topic-list";

export const metadata: Metadata = { title: "Library" };

// The page's frame: 16px from the title row to the tabs, then 28px (20px on a
// phone) down to the content.
function Shell({
  area,
  q,
  label,
  count,
  children,
}: {
  area: AreaKey;
  q?: string;
  label: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 md:gap-7">
      <div className="flex flex-col gap-4">
        <PageHeader title="Library" action={<LibrarySearch area={area} q={q} label={label} />} />
        <TrackTabs
          tracks={AREAS.map((a) => ({ key: a.key, label: a.label, href: `/library?area=${a.key}` }))}
          active={area}
          count={count}
        />
      </div>
      {children}
    </div>
  );
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const viewer = await requireViewer();
  const params = await searchParams;
  // `track` is the design the design's name for the same thing; `area` is what the app's links already use.
  const wanted = params.area ?? params.track;
  const area = (AREAS.some((a) => a.key === wanted) ? wanted : "dsa") as AreaKey;
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim() : undefined;

  if (area === "dsa" || area === "competitive") {
    const kind = area === "dsa" ? "leetcode" : "competitive";
    if (q) {
      const rows = await problemList(viewer.id, { kind, q });
      return (
        <Shell area={area} q={q} label="Search problems" count={null}>
          <section className="flex flex-col gap-3" aria-label="Results">
            <h2 className="font-display text-heading font-semibold text-text">Results for “{q}”</h2>
            <ProblemList rows={rows} empty="Nothing matches that." label={`Results for ${q}`} tags={area === "competitive"} />
          </section>
        </Shell>
      );
    }
    if (area === "dsa") {
      const map = await patternMap(viewer.id);
      if (map.patterns.length === 0) {
        return (
          <Shell area={area} label="Search problems" count={0}>
            <p className="rounded-xl border border-line bg-surface p-4 text-small text-mute">Content isn&apos;t published yet.</p>
          </Shell>
        );
      }
      // The pattern in the URL, if it is one; else the first that needs work, else the first.
      const pattern =
        map.patterns.find((p) => p.slug === params.pattern) ?? map.patterns.find((p) => p.state === "weak") ?? map.patterns[0]!;
      const rows = await problemList(viewer.id, { kind, pattern: pattern.slug });
      return (
        <Shell area={area} label="Search problems" count={map.patterns.length}>
          <DsaView patterns={map.patterns} links={map.links} selected={pattern.slug} rows={rows} />
        </Shell>
      );
    }
    const [rows, total] = await Promise.all([problemList(viewer.id, { kind }), problemCount(kind)]);
    return (
      <Shell area={area} label="Search problems" count={total}>
        <section className="flex flex-col gap-3" aria-label="Competitive">
          <h2 className="font-display text-heading font-semibold text-text">Competitive</h2>
          <ProblemList rows={rows} empty="Nothing here yet." label="Competitive problems" tags />
        </section>
      </Shell>
    );
  }

  if (q) {
    const hits = await searchArea(area, q);
    return (
      <Shell area={area} q={q} label="Search topics" count={null}>
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Results for “{q}”</h2>
          {hits.topics.length === 0 ? (
            <EmptyState title="No matches">Nothing in this area matches that.</EmptyState>
          ) : (
            <ul className="flex flex-col rounded-xl border border-line bg-surface">
              {hits.topics.map((t) => (
                <li key={t.slug} className="border-t border-line first:border-0">
                  <Link href={`/library/topic/${t.slug}`} className="flex flex-col gap-0.5 px-4 py-3.5 hover:bg-surface-2">
                    <span className="font-semibold text-text">{t.name}</span>
                    {t.summary && <span className="text-small text-mute">{t.summary}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Shell>
    );
  }

  const groups = groupTopics(await areaTopics(area, viewer.id));
  return (
    <Shell area={area} q={q} label="Search topics" count={groups.reduce((n, g) => n + g.items.length, 0)}>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-small text-mute">Topics for this area are being prepared.</p>
      ) : (
        <TopicList groups={groups} />
      )}
    </Shell>
  );
}
