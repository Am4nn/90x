import { PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Friends">
      <RowsSkeleton n={2} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-6">
          <RowsSkeleton n={4} />
          <RowsSkeleton n={3} />
        </div>
        <RowsSkeleton n={3} />
      </div>
    </PageSkeleton>
  );
}
