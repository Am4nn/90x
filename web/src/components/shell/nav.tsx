"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand";
import { CoachIcon, FeedIcon, FriendsIcon, LibraryIcon, MeIcon, TodayIcon } from "@/components/icons";

// The mobile tab bar keeps five tabs; the desktop sidebar adds Friends (six).
const TABS = [
  { href: "/today", label: "Today", Icon: TodayIcon },
  { href: "/feed", label: "Feed", Icon: FeedIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/coach", label: "Coach", Icon: CoachIcon },
  { href: "/me", label: "Me", Icon: MeIcon },
] as const;

const SIDEBAR = [...TABS.slice(0, 4), { href: "/friends", label: "Friends", Icon: FriendsIcon }, TABS[4]] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar on phones. */
export function TabBar() {
  const pathname = usePathname();
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
            className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-tag font-semibold transition-colors ${on ? "bg-cyan-bg text-cyan" : "text-mute hover:text-text-2"}`}
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
  const pathname = usePathname();
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
            className={`group flex items-center gap-3 rounded-lg p-2.5 text-body font-semibold transition-colors ${on ? "bg-cyan-bg text-cyan" : "text-text-2 hover:bg-surface hover:text-text"}`}
          >
            <Icon className={`size-5 ${on ? "" : "text-mute group-hover:text-text-2"}`} />
            {label}
          </Link>
        );
      })}
      {footer && <div className="mt-auto">{footer}</div>}
    </aside>
  );
}
