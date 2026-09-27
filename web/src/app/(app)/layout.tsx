import Link from "next/link";
import { SyncOnOpen } from "@/components/leetcode/sync-on-open";
import { Sidebar, TabBar } from "@/components/shell/nav";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const adminLink = viewer.isAdmin ? (
    <Link
      href="/admin"
      className="flex h-9 items-center rounded-md px-2.5 text-small font-semibold text-text-2 hover:bg-surface hover:text-text"
    >
      Admin
    </Link>
  ) : undefined;
  return (
    <div className="flex min-h-dvh">
      <Sidebar footer={adminLink} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pt-5 pb-28 md:px-10 md:pt-8 md:pb-10">{children}</main>
      <TabBar />
      {syncEnabled() && <SyncOnOpen />}
    </div>
  );
}
