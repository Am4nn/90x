import { Bar, PageSkeleton, RowsSkeleton, TilesSkeleton } from "@/components/skeleton";

// One skeleton per tab, shared by the route's loading.tsx and the shell's instant tap
// feedback (components/shell/nav-state), so the two can never drift apart.

export function TodaySkeleton() {
  return (
    <PageSkeleton title="Today">
      <Bar w="w-56" h={14} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14px,1fr))] gap-1 md:grid-cols-10">
        {Array.from({ length: 30 }, (_, i) => (
          <Bar key={i} w="w-full" h={14} />
        ))}
      </div>
      <Bar w="w-3/4" h={14} />
      <RowsSkeleton n={4} />
    </PageSkeleton>
  );
}

export function FeedSkeleton() {
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

export function LibrarySkeleton() {
  return (
    <PageSkeleton title="Library">
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Bar key={i} w="w-16" h={36} className="rounded-full" />
        ))}
      </div>
      <Bar w="w-full" h={260} className="rounded-xl" />
      <RowsSkeleton n={6} />
    </PageSkeleton>
  );
}

export function CoachSkeleton() {
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

export function MeSkeleton() {
  return (
    <PageSkeleton title="Me">
      <div className="flex items-center gap-5 rounded-xl border border-line bg-surface p-5">
        <Bar w="w-24" h={96} className="rounded-full" />
        <div className="flex flex-1 flex-col gap-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Bar key={i} w="w-full" h={10} />
          ))}
        </div>
      </div>
      <TilesSkeleton n={3} />
      <RowsSkeleton n={3} />
    </PageSkeleton>
  );
}

export function FriendsSkeleton() {
  return (
    <PageSkeleton title="Friends">
      <RowsSkeleton n={2} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-6">
          <RowsSkeleton n={4} />
          <RowsSkeleton n={3} />
        </div>
        <RowsSkeleton n={3} />
      </div>
    </PageSkeleton>
  );
}

export const TAB_SKELETONS: Record<string, () => React.ReactNode> = {
  "/today": TodaySkeleton,
  "/feed": FeedSkeleton,
  "/library": LibrarySkeleton,
  "/coach": CoachSkeleton,
  "/me": MeSkeleton,
  "/friends": FriendsSkeleton,
};
