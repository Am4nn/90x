import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Lessons">
      <Bar w="w-56" h={12} />
      <div className="flex flex-col gap-3">
        <Bar w="w-40" h={18} />
        <RowsSkeleton n={3} />
      </div>
      <div className="flex flex-col gap-3">
        <Bar w="w-32" h={18} />
        <RowsSkeleton n={5} />
      </div>
      <Bar w="w-full" h={64} className="rounded-xl" />
    </PageSkeleton>
  );
}
