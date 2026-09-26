import { PageHeader } from "./page-header";

// Loading skeletons shaped like the pages they stand in for (after Curfew's
// _skeleton.tsx). One pulse on the wrapper; reduced motion turns it off.

export function Bar({ w = "w-full", h = 13, className = "" }: { w?: string; h?: number; className?: string }) {
  return <div className={`rounded-md bg-surface-2 ${w} ${className}`} style={{ height: h }} />;
}

export function RowsSkeleton({ n = 5 }: { n?: number }) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-t border-line px-4 py-3.5 first:border-0">
          <Bar w="w-5" h={20} />
          <div className="flex flex-1 flex-col gap-2">
            <Bar w={i % 3 === 0 ? "w-2/3" : i % 3 === 1 ? "w-1/2" : "w-3/5"} h={14} />
            <Bar w={i % 2 ? "w-1/4" : "w-1/3"} h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TilesSkeleton({ n = 3 }: { n?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
          <Bar w="w-12" h={10} />
          <Bar w="w-16" h={28} />
        </div>
      ))}
    </div>
  );
}

/** Whole-page skeleton with the real title, so nothing jumps when content lands. */
export function PageSkeleton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={`Loading ${title}`}>
      <PageHeader title={title} />
      <div className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none">{children}</div>
    </div>
  );
}
