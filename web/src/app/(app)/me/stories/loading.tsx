import { Bar, PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Story bank">
      <Bar w="w-full" h={8} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
            <Bar w="w-2/3" h={18} />
            {[0, 1, 2, 3].map((j) => (
              <Bar key={j} w="w-full" h={10} />
            ))}
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
