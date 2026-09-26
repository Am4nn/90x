import { PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Coach">
      <RowsSkeleton n={3} />
    </PageSkeleton>
  );
}
