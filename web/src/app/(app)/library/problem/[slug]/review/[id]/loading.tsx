import { Bar, PageSkeleton, TilesSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Solution review">
      <TilesSkeleton n={2} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          {Array.from({ length: 12 }, (_, i) => (
            <Bar key={i} w={i % 4 === 3 ? "w-1/2" : i % 3 === 1 ? "w-3/4" : "w-2/3"} h={12} />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Bar w="w-full" h={120} className="rounded-xl" />
          <Bar w="w-full" h={90} className="rounded-xl" />
        </div>
      </div>
    </PageSkeleton>
  );
}
