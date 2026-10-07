import Link from "next/link";

/** What an admin sees on every page while maintenance mode is on (maintenance mock #banner). */
export function MaintenanceBanner() {
  return (
    <div className="pt-safe-banner sticky top-0 z-40 bg-background">
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn/30 bg-warn/10 px-4 py-2.5 text-small font-semibold text-warn"
      >
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn max-sm:hidden" />
        <span className="min-w-0 flex-1">
          Maintenance mode is on. <span className="font-medium text-text-2">Only admins can use the app.</span>
        </span>
        <Link
          href="/admin/settings"
          className="inline-flex h-7 shrink-0 items-center rounded-lg border border-warn/40 px-3 font-bold hover:bg-warn/10"
        >
          Turn off
        </Link>
      </div>
    </div>
  );
}
