import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { button } from "@/components/button-styles";

// Static, so the service worker can keep it from install and show it for any
// page that was never opened on this device.
export const dynamic = "force-static";
export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-12">
      <Logo className="text-display" />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-title font-semibold">You&apos;re offline</h1>
        <p className="text-text-2">
          This page isn&apos;t saved on this device yet. Today and the Feed work offline once you&apos;ve opened 90x online.
        </p>
      </div>
      <div className="flex gap-2.5">
        <Link href="/today" className={`${button({ variant: "primary", size: "lg" })} flex-1`}>
          Open Today
        </Link>
        <Link href="/feed" className={`${button({ size: "lg" })} flex-1`}>
          Open Feed
        </Link>
      </div>
    </main>
  );
}
