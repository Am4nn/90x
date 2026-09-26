import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/brand";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Waiting for approval" };

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (viewer.approval === "approved") redirect("/today");
  const rejected = viewer.approval === "rejected";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-12">
      <Logo />
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-title font-semibold">{rejected ? "This account wasn't approved" : "Waiting for approval"}</h1>
        <p className="text-text-2">
          {rejected
            ? "Ask the person who invited you to check which Google account they approved."
            : `You're signed in as ${viewer.email}. An admin needs to approve this account before you can use 90x.`}
        </p>
      </div>
      <form action={signOut}>
        <button className="h-11 rounded-xl border border-line-2 px-5 font-semibold text-text hover:bg-surface">Sign out</button>
      </form>
    </main>
  );
}
