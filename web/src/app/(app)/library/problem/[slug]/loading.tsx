import { Bar, PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Problem">
      <Bar w="w-40" h={12} />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 8 }, (_, i) => <Bar key={i} w={i % 3 === 2 ? "w-2/3" : "w-full"} h={13} />)}
      </div>
      <Bar w="w-full" h={140} className="rounded-xl" />
    </PageSkeleton>
  );
}
