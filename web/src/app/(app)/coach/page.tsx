import type { Metadata } from "next";
import Link from "next/link";
import { MockThreadHeader } from "@/components/coach/mock-thread-header";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Coach" };

// The mock header's End button runs the scoring call from this page.
export const maxDuration = 60;

export default async function CoachPage({ searchParams }: PageProps<"/coach">) {
  const viewer = await requireViewer();
  const { kind, ref } = await searchParams;
  return (
    <>
      <PageHeader title="Coach" />
      {kind === "mock" && typeof ref === "string" && <MockThreadHeader userId={viewer.id} mockId={ref} />}
      <p className="text-text-2">Your coach arrive soon.</p>
      <Link href="/coach/mocks" className="text-small font-semibold text-cyan">
        Mock interviews
      </Link>
    </>
  );
}
