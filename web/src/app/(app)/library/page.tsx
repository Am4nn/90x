import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { LibrarySearch } from "@/components/library/library-search";
import { PatternMap } from "@/components/library/pattern-map";
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
    const map = area === "dsa" ? await patternMap(viewer.id) : null;
    const weakest = map?.patterns.find((p) => p.state === "weak") ?? map?.patterns.find((p) => p.state === "started");
    const pattern = typeof params.pattern === "string" ? params.pattern : q ? undefined : (weakest?.slug ?? map?.patterns[0]?.slug);
    const current = map?.patterns.find((p) => p.slug === pattern);
    const [rows, total] = await Promise.all([
      problemList(viewer.id, { kind, pattern: area === "dsa" ? pattern : undefined, q }),
      map || q ? null : problemCount(kind),
    ]);
    return (
      <Shell area={area} q={q} label="Search problems" count={q ? null : (map?.patterns.length ?? total)}>
        <div className="flex flex-col gap-6">
          {map && map.patterns.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-heading font-semibold">Patterns</h2>
                <span className="text-small text-mute">
                  {map.patterns.filter((p) => p.state === "mastered").length} of {map.patterns.length} mastered
                </span>
              </div>
              <PatternMap patterns={map.patterns} links={map.links} selected={pattern} />
            </section>
          )}
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-heading font-semibold">
                {q ? `Results for “${q}”` : (current?.name ?? (area === "competitive" ? "Competitive" : "Problems"))}
              </h2>
              {current && (
                <span className="text-small text-mute">
                  {current.solved} of {current.total} solved
                </span>
              )}
            </div>
            <ProblemList rows={rows} empty={map && map.patterns.length === 0 ? "Content isn't published yet." : "Nothing here yet."} />
          </section>
        </div>
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
