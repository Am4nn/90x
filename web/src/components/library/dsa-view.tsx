"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { PatternMap } from "@/components/library/pattern-map";
import { PatternPicker } from "@/components/library/pattern-picker";
import { ProblemList } from "@/components/library/problem-list";
import type { MapLink } from "@/lib/library/map-layout";
import type { PatternNode, ProblemRow } from "@/lib/library/queries";

// The DSA tab: the pattern map beside the selected pattern's problems.
// One selection drives both the map and the dropdown, and lives in the URL (`?pattern=`), so
// it survives a reload; the problem list follows from the server.

export function DsaView({
  patterns,
  links,
  selected,
  rows,
}: {
  patterns: PatternNode[];
  links: MapLink[];
  selected: string;
  rows: ProblemRow[];
}) {
  const router = useRouter();
  // Shows the new pick at once; settles on the server's selection when the page comes back.
  const [sel, setSel] = useOptimistic(selected);
  const [pending, startTransition] = useTransition();

  const pick = (slug: string) => {
    if (slug === sel) return;
    startTransition(() => {
      setSel(slug);
      router.replace(`/library?area=dsa&pattern=${encodeURIComponent(slug)}`, { scroll: false });
    });
  };
  const current = patterns.find((p) => p.slug === sel) ?? patterns[0]!;

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_400px] md:items-start md:gap-7">
      <PatternMap patterns={patterns} links={links} selected={current.slug} onSelect={pick} />
      <section className="flex min-w-0 flex-col gap-3" aria-label="Problems">
        <div className="flex items-baseline justify-between gap-3">
          <PatternPicker patterns={patterns} selected={current} onSelect={pick} />
          <span className="tabular shrink-0 text-small font-medium text-mute">
            {current.solved} of {current.total} solved
          </span>
        </div>
        <div aria-busy={pending || undefined} className={`transition-opacity ${pending ? "opacity-60" : ""}`}>
          <ProblemList rows={rows} empty="Nothing here yet." label={`${current.name} problems`} />
        </div>
      </section>
    </div>
  );
}
