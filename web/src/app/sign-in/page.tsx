import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { getViewer } from "@/lib/auth/viewer";
import { GoogleButton } from "./google-button";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getViewer()) redirect("/today");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-10 px-5 py-12">
      <div className="flex flex-col gap-4">
        <Logo className="text-display" />
        <h1 className="font-display text-title font-semibold">Train. Measure. Adapt.</h1>
        <p className="text-text-2">
          Daily missions, a question feed and a coach that knows your progress. Invite-only: new accounts wait for an admin to approve them.
        </p>
      </div>
      <GoogleButton />
      {error && <p className="text-small text-bad">Sign-in didn&apos;t complete. Try again.</p>}
    </main>
  );
}
