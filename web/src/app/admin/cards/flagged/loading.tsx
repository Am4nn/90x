import { Bar, PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageSkeleton title="Flagged">
        <Bar w="w-2/3" h={12} />
        {Array.from({ length: 2 }, (_, i) => (
          <Bar key={i} w="w-full" h={220} className="rounded-xl" />
        ))}
      </PageSkeleton>
    </main>
  );
}
