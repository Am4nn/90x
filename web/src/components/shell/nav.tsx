"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MiniPlayer } from "@/components/audio/mini-player";
import { Logo } from "@/components/brand";
import { SIDEBAR, TABS } from "./nav-items";
import { useNavPending } from "./nav-state";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The tapped destination counts as current at once, before the route commits.
function useCurrentPath() {
  const pathname = usePathname();
  return useNavPending() ?? pathname;
}

/** Bottom tab bar on phones. */
export function TabBar() {
  const pathname = useCurrentPath();
  return (
    <nav
      aria-label="Main"
      className="pb-safe-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1 border-t border-line bg-background px-2 pt-2 md:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const on = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-tag font-semibold transition-[color,opacity,scale] active:scale-95 active:opacity-70 ${on ? "bg-cyan-bg text-cyan" : "text-mute hover:text-text-2"}`}
          >
            <Icon className="size-5.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Left sidebar on desktop. */
export function Sidebar({ footer }: { footer?: React.ReactNode }) {
  const pathname = useCurrentPath();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col gap-1.5 border-r border-line px-3.5 py-6 md:flex">
      <Link href="/today" className="px-2.5 pb-5">
        <Logo />
      </Link>
      {SIDEBAR.map(({ href, label, Icon }) => {
        const on = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg p-2.5 text-body font-semibold transition-[color,background-color,opacity,scale] active:opacity-70 ${on ? "bg-cyan-bg text-cyan" : "text-text-2 hover:bg-surface hover:text-text"}`}
          >
            <Icon className={`size-5 ${on ? "" : "text-mute group-hover:text-text-2"}`} />
            {label}
          </Link>
        );
      })}
      {/* The sidebar mini-player (mock: Desktop) sits at the foot, above the admin link when there is one. */}
      <div className="mt-auto flex flex-col gap-3">
        <MiniPlayer placement="sidebar" />
        {footer}
      </div>
    </aside>
  );
}
