import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Library">
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Bar key={i} w="w-16" h={36} className="rounded-full" />
        ))}
      </div>
      <Bar w="w-full" h={260} className="rounded-xl" />
      <RowsSkeleton n={6} />
    </PageSkeleton>
  );
}
