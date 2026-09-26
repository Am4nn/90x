import { Bar, PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Feed">
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <Bar w="w-20" h={12} />
        <Bar w="w-full" h={18} />
        <Bar w="w-2/3" h={18} />
        <Bar w="w-full" h={96} />
      </div>
    </PageSkeleton>
  );
}
