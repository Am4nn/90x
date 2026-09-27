import { PageSkeleton, TilesSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageSkeleton title="Admin">
        <TilesSkeleton n={2} />
        <TilesSkeleton n={2} />
      </PageSkeleton>
    </main>
  );
}
