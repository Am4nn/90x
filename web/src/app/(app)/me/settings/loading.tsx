import { PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Settings">
      <RowsSkeleton n={3} />
      <RowsSkeleton n={3} />
      <RowsSkeleton n={1} />
    </PageSkeleton>
  );
}
