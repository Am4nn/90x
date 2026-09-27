import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="What Coach knows">
      <Bar w="w-2/3" h={14} />
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <RowsSkeleton n={3} />
        <RowsSkeleton n={2} />
      </div>
    </PageSkeleton>
  );
}
