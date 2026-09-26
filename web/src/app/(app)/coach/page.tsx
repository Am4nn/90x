import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return (
    <>
      <PageHeader title="Coach" />
      <p className="text-text-2">Your coach arrive soon.</p>
    </>
  );
}
