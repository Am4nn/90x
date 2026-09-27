import { Bar, PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <PageSkeleton title="Batch review">
        <div className="flex flex-col gap-2.5">
          <Bar w="w-48" h={14} />
          <Bar w="w-full" h={6} />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Bar w="w-full" h={320} className="rounded-xl" />
            <Bar w="w-full" h={44} className="rounded-xl" />
          </div>
          <div className="flex flex-col gap-4">
            <Bar w="w-full" h={120} className="rounded-xl" />
            <Bar w="w-full" h={96} className="rounded-xl" />
          </div>
        </div>
      </PageSkeleton>
    </main>
  );
}
