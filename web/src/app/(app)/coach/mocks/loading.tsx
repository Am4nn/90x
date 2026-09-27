import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Mock interviews">
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
            <Bar w="w-32" h={18} />
            <Bar w="w-2/3" h={10} />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }, (_, j) => (
                <Bar key={j} w="w-24" h={40} className="rounded-full" />
              ))}
            </div>
            <Bar w="w-full" h={44} className="rounded-xl" />
          </div>
        ))}
      </div>
      <RowsSkeleton n={3} />
    </PageSkeleton>
  );
}
