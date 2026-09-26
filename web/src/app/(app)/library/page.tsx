import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" />
      <p className="text-text-2">Pattern Map, problems and notes arrive in this stage.</p>
    </>
  );
}
