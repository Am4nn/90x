import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/button-styles";
import { AdminIcon } from "@/components/icons";
import { SyncOnOpen } from "@/components/leetcode/sync-on-open";
import { MaintenanceBanner } from "@/components/maintenance/banner";
import { ReloadOnDown } from "@/components/maintenance/reload-on-down";
import { ForgetOfflineData } from "@/components/offline/forget-offline-data";
import { OfflineSync } from "@/components/offline/offline-sync";
import { Sidebar, TabBar } from "@/components/shell/nav";
import { NavProgress } from "@/components/shell/nav-progress";
import { NavContent, NavProvider } from "@/components/shell/nav-state";
import { syncEnabled } from "@/lib/activity/service";
import { adminBadges } from "@/lib/admin/badges";
import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { maintenanceState } from "@/lib/maintenance/flag";

// Signed-in pages stay out of search results; robots.ts only asks crawlers not to fetch them.
export const metadata: Metadata = { robots: { index: false } };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  // The badge is decoration on a link. If its query fails the admin still needs
  // every page in the app, so log it and render the link without a count.
  const badges = viewer.isAdmin
    ? await adminBadges(viewer.id).catch((e: unknown) => {
        logError("admin badges unavailable", e);
        return null;
      })
    : null;
  // Only an admin can be here while maintenance is on (the proxy turns everyone else away), and only an admin needs telling.
  const maintenance = viewer.isAdmin && (await maintenanceState()).on;
  const adminLink = viewer.isAdmin ? (
    <Link href="/admin" className={`${button({ size: "sm" })} w-full`}>
      <AdminIcon className="size-4 text-mute" />
      Admin
      {badges && badges.attention > 0 && (
        <span className="text-bg rounded-full bg-bad px-1.5 text-tag font-semibold">
          {badges.attention}
          <span className="sr-only"> needing attention</span>
        </span>
      )}
      {badges && badges.review > 0 && (
        <span className="rounded-full bg-cyan px-1.5 text-tag font-semibold text-on-cyan">
          {badges.review}
          <span className="sr-only"> {badges.review === 1 ? "batch" : "batches"} to review</span>
        </span>
      )}
    </Link>
  ) : undefined;
  return (
    <NavProvider>
      <NavProgress />
      {maintenance && <MaintenanceBanner />}
      <div className="flex min-h-dvh">
        <Sidebar footer={adminLink} />
        {/* The status bar is translucent so the splash lines up with the iOS launch
          image, which means this content would otherwise sit underneath it. */}
        <main className="pt-safe mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 md:px-10 md:pt-8 md:pb-10">
          <NavContent>{children}</NavContent>
        </main>
        <TabBar />
        {syncEnabled() && <SyncOnOpen />}
        {/* Before OfflineSync, so another person's saved pages go before this person's are kept. */}
        <ForgetOfflineData userId={viewer.id} />
        <OfflineSync userId={viewer.id} />
        <ReloadOnDown />
      </div>
    </NavProvider>
  );
}
