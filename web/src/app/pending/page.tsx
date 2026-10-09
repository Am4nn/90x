import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { button } from "@/components/button-styles";
import { DeleteAccount } from "@/components/delete-account";
import { SignOutForm } from "@/components/sign-out-form";
import { getViewer } from "@/lib/auth/viewer";
import { SUPPORT_EMAIL } from "@/lib/trust/report-rules";

// The tab title follows the state: "Almost in" is the default, the blocked screen sets its own below.
export async function generateMetadata(): Promise<Metadata> {
  const viewer = await getViewer();
  return { title: viewer?.approval === "rejected" ? "This account can't use 90x" : "Almost in" };
}

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  if (viewer.approval === "approved") redirect("/today");
  const rejected = viewer.approval === "rejected";
  return (
    <main className="pt-safe-lg mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 pb-12">
      <Logo />
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-title font-semibold">{rejected ? "This account can't use 90x" : "Almost in"}</h1>
        <p className="text-text-2">
          {rejected
            ? `You're signed in as ${viewer.email}. If you think this is a mistake, email ${SUPPORT_EMAIL} from this address.`
            : `You're signed in as ${viewer.email}. An admin lets new accounts in by hand right now. You'll get an email when you're in.`}
        </p>
      </div>
      <SignOutForm>
        <button className={button({ size: "lg" })}>Sign out</button>
      </SignOutForm>
      {/* Waiting or blocked, the account is still theirs to delete: the same control and action as Settings. */}
      <DeleteAccount />
    </main>
  );
}
