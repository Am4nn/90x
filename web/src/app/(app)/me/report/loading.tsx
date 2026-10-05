import { PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Report a problem">
      <RowsSkeleton n={2} />
    </PageSkeleton>
  );
}
