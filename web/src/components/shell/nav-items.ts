import { CoachIcon, FeedIcon, FriendsIcon, LibraryIcon, MeIcon, TodayIcon } from "@/components/icons";

// The mobile tab bar keeps five tabs; the desktop sidebar adds Friends (six).
export const TABS = [
  { href: "/today", label: "Today", Icon: TodayIcon },
  { href: "/feed", label: "Feed", Icon: FeedIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/coach", label: "Coach", Icon: CoachIcon },
  { href: "/me", label: "Me", Icon: MeIcon },
] as const;

export const SIDEBAR = [...TABS.slice(0, 4), { href: "/friends", label: "Friends", Icon: FriendsIcon }, TABS[4]] as const;
