import { Bar, PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Review my solution">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
          <Bar w="w-24" h={12} />
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Bar key={i} w="w-20" h={40} className="rounded-full" />
            ))}
          </div>
          <Bar w="w-full" h={320} className="rounded-xl" />
          <Bar w="w-40" h={44} className="rounded-xl" />
        </div>
        <Bar w="w-full" h={120} className="rounded-xl" />
      </div>
    </PageSkeleton>
  );
}
