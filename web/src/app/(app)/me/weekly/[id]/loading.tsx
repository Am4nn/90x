import { Bar, PageSkeleton, RowsSkeleton, TilesSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Weekly review">
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-6">
          <TilesSkeleton n={2} />
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Bar key={i} w={i % 2 ? "w-5/6" : "w-full"} h={12} />
            ))}
          </div>
        </div>
        <RowsSkeleton n={3} />
      </div>
    </PageSkeleton>
  );
}
