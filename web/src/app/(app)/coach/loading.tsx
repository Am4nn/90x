import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Coach">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] md:gap-8">
        <div className="flex flex-col gap-6">
          <RowsSkeleton n={3} />
          <RowsSkeleton n={4} />
        </div>
        <div className="hidden min-h-96 flex-col gap-4 rounded-xl border border-line bg-surface p-6 md:flex">
          <Bar w="w-40" h={16} />
          <Bar w="w-2/3" h={44} className="self-end rounded-2xl" />
          <Bar w="w-3/4" h={88} className="rounded-2xl" />
          <Bar w="w-full" h={56} className="mt-auto rounded-xl" />
        </div>
      </div>
    </PageSkeleton>
  );
}
