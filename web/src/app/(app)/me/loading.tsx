import { Bar, PageSkeleton, RowsSkeleton, TilesSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Me">
      <div className="flex items-center gap-5 rounded-xl border border-line bg-surface p-5">
        <Bar w="w-24" h={96} className="rounded-full" />
        <div className="flex flex-1 flex-col gap-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Bar key={i} w="w-full" h={10} />
          ))}
        </div>
      </div>
      <TilesSkeleton n={3} />
      <RowsSkeleton n={3} />
    </PageSkeleton>
  );
}
