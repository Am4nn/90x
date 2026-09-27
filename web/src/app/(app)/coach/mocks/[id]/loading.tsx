import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Mock result">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
          <Bar w="w-24" h={44} />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Bar w="w-1/3" h={12} />
              <Bar w="w-full" h={8} />
              <Bar w="w-2/3" h={10} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <RowsSkeleton n={3} />
          <RowsSkeleton n={3} />
        </div>
      </div>
    </PageSkeleton>
  );
}
