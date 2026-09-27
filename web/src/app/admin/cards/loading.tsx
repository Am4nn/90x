import { Bar, PageSkeleton, RowsSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <PageSkeleton title="Cards">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Bar w="w-2/3" h={12} />
            <RowsSkeleton n={4} />
            <RowsSkeleton n={3} />
          </div>
          <Bar w="w-full" h={72} className="rounded-xl" />
        </div>
      </PageSkeleton>
    </main>
  );
}
