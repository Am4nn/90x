import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Me" };

export default function MePage() {
  return (
    <>
      <PageHeader title="Me" />
      <p className="text-text-2">Readiness and progress arrive soon.</p>
    </>
  );
}
