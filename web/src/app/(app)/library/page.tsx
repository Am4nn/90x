import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PatternMap } from "@/components/library/pattern-map";
import { ProblemList } from "@/components/library/problem-list";
import { RoadmapList } from "@/components/library/roadmap";
import { RoadmapGraphs } from "@/components/library/roadmap-graph";
import { PageHeader } from "@/components/page-header";
import { Segmented } from "@/components/ui/segmented";
import { requireViewer } from "@/lib/auth/viewer";
import { AREAS, type AreaKey, areaTopics, patternMap, problemList, searchArea } from "@/lib/library/queries";
import { roadmapsFor } from "@/lib/library/roadmap";

export const metadata: Metadata = { title: "Library" };

function AreaTabs({ area }: { area: AreaKey }) {
  return (
    <nav aria-label="Areas" className="rounded-xl border border-line bg-surface p-1">
      {/* Nine areas don't fit a phone: the fade says the row scrolls. */}
      <div className="flex gap-1 overflow-x-auto mask-r-from-85% md:mask-none">
        {AREAS.map((a) => (
          <Link
            key={a.key}
            href={`/library?area=${a.key}`}
            aria-current={a.key === area ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-small font-semibold ${a.key === area ? "bg-surface-2 text-text" : "text-mute hover:text-text-2"}`}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Search({ area, q, placeholder }: { area: AreaKey; q?: string; placeholder: string }) {
  return (
    <form action="/library" className="flex">
      <input type="hidden" name="area" value={area} />
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border border-line-2 bg-surface px-3.5 text-small text-text outline-none focus:border-cyan md:w-72"
      />
    </form>
  );
}

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const area = (AREAS.some((a) => a.key === params.area) ? params.area : "dsa") as AreaKey;
  const q = typeof params.q === "string" && params.q.trim() ? params.q.trim() : undefined;

  if (area === "dsa" || area === "competitive") {
    const kind = area === "dsa" ? "leetcode" : "competitive";
    const map = area === "dsa" ? await patternMap(viewer.id) : null;
    const weakest = map?.patterns.find((p) => p.state === "weak") ?? map?.patterns.find((p) => p.state === "started");
    const pattern = typeof params.pattern === "string" ? params.pattern : q ? undefined : (weakest?.slug ?? map?.patterns[0]?.slug);
    const current = map?.patterns.find((p) => p.slug === pattern);
    const rows = await problemList(viewer.id, { kind, pattern: area === "dsa" ? pattern : undefined, q });
    return (
      <>
        <PageHeader title="Library" action={<Search area={area} q={q} placeholder="Search problems" />} />
        <AreaTabs area={area} />
        {map && map.patterns.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-heading font-semibold">Patterns</h2>
              <span className="text-small text-mute">
                {map.patterns.filter((p) => p.state === "mastered").length} of {map.patterns.length} mastered
              </span>
            </div>
            <PatternMap patterns={map.patterns} links={map.links} selected={pattern} />
            {current && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="text-small text-text-2">
                  Selected: <span className="font-semibold text-text">{current.name}</span>
                </span>
                <Link
                  href={`/coach?kind=lesson&ref=${current.slug}`}
                  className="shrink-0 text-small font-semibold text-cyan hover:underline"
                >
                  Teach me this pattern
                </Link>
              </div>
            )}
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
      </>
    );
  }

  const header = (
    <>
      <PageHeader title="Library" action={<Search area={area} q={q} placeholder="Search topics" />} />
      <AreaTabs area={area} />
    </>
  );

  if (q) {
    const hits = await searchArea(area, q);
    return (
      <>
        {header}
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
      </>
    );
  }

  const [topicRows, roadmaps] = await Promise.all([areaTopics(area), roadmapsFor(viewer.id, area)]);
  const parents = topicRows.filter((t) => !t.parent);
  const children = (slug: string) => topicRows.filter((t) => t.parent === slug);
  const toggle =
    roadmaps.length > 0 ? (
      <Segmented
        name="View"
        value={params.view === "roadmap" ? "roadmap" : "list"}
        options={[
          { value: "list", label: "List", href: `/library?area=${area}` },
          { value: "roadmap", label: "Roadmap", href: `/library?area=${area}&view=roadmap` },
        ]}
      />
    ) : null;
  if (toggle && params.view === "roadmap") {
    return (
      <>
        {header}
        {toggle}
        <RoadmapGraphs roadmaps={roadmaps} />
      </>
    );
  }
  return (
    <>
      {header}
      {toggle}
      {topicRows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-small text-mute">Topics for this area are being prepared.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {parents.map((t) => (
            <div key={t.slug} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
              <Link href={`/library/topic/${t.slug}`} className="flex items-baseline justify-between gap-3">
                <span className="font-display text-heading font-semibold hover:text-cyan">{t.name}</span>
              </Link>
              {(t.summary ?? t.description) && <p className="text-small text-mute">{t.summary ?? t.description}</p>}
              {children(t.slug).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {children(t.slug).map((c) => (
                    <Link
                      key={c.slug}
                      href={`/library/topic/${c.slug}`}
                      className="rounded-full border border-line-2 px-3 py-1.5 text-small text-text-2 hover:border-cyan hover:text-text"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {roadmaps.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-heading font-semibold text-text">Roadmap</h2>
            <p className="text-small text-mute">Everything this area covers, in reading order. Tick what you already know.</p>
          </div>
          <RoadmapList roadmaps={roadmaps} />
        </section>
      )}
    </>
  );
}
