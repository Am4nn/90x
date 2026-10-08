import Link from "next/link";
import { Logo } from "@/components/brand";
import { button } from "@/components/button-styles";

export default function NotFound() {
  return (
    <main className="pt-safe-lg mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 pb-10">
      <Logo />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title font-semibold">No such page.</h1>
        <p className="text-text-2">The link may be old, or the item was removed.</p>
      </div>
      {/* "/" serves both: the landing page when signed out, and the proxy sends a
          signed-in visitor on to Today (landingRedirect), so no auth lookup here. */}
      <Link href="/" prefetch={false} className={`${button({ variant: "primary", size: "lg" })} self-start`}>
        Back to 90x
      </Link>
    </main>
  );
}
