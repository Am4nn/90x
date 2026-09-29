import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Today">
      <Bar w="w-56" h={14} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14px,1fr))] gap-1 md:grid-cols-10">
        {Array.from({ length: 30 }, (_, i) => (
          <Bar key={i} w="w-full" h={14} />
        ))}
      </div>
      <Bar w="w-3/4" h={14} />
      <RowsSkeleton n={4} />
    </PageSkeleton>
  );
}
