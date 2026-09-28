import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/button-styles";
import { AdminIcon } from "@/components/icons";
import { SyncOnOpen } from "@/components/leetcode/sync-on-open";
import { OfflineSync } from "@/components/offline/offline-sync";
import { Sidebar, TabBar } from "@/components/shell/nav";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";

// Signed-in pages stay out of search results; robots.ts only asks crawlers not to fetch them.
export const metadata: Metadata = { robots: { index: false } };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const adminLink = viewer.isAdmin ? (
    <Link href="/admin" className={`${button({ size: "sm" })} w-full`}>
      <AdminIcon className="size-4 text-mute" />
      Admin
    </Link>
  ) : undefined;
  return (
    <div className="flex min-h-dvh">
      <Sidebar footer={adminLink} />
      {/* The status bar is translucent so the splash lines up with the iOS launch
          image, which means this content would otherwise sit underneath it. */}
      <main className="pt-safe mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 md:px-10 md:pt-8 md:pb-10">{children}</main>
      <TabBar />
      {syncEnabled() && <SyncOnOpen />}
      <OfflineSync userId={viewer.id} />
    </div>
  );
}
