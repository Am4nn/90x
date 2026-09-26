import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Plan">
      <div className="flex gap-2">{Array.from({ length: 4 }, (_, i) => <Bar key={i} w="w-20" h={40} className="rounded-full" />)}</div>
      <RowsSkeleton n={7} />
    </PageSkeleton>
  );
}
