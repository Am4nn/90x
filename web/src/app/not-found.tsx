import Link from "next/link";
import { Logo } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5">
      <Logo />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title font-semibold">No such page.</h1>
        <p className="text-text-2">The link may be old, or the item was removed.</p>
      </div>
      <Link href="/today" className="flex h-11 w-fit items-center rounded-xl bg-cyan px-5 font-semibold text-on-cyan">
        Back to Today
      </Link>
    </main>
  );
}
