import { Bar, PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 py-10">
      <PageSkeleton title="Set up your campaign">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Bar w="w-28" h={11} />
            <Bar w="w-full" h={40} className="rounded-xl" />
          </div>
        ))}
      </PageSkeleton>
    </main>
  );
}
