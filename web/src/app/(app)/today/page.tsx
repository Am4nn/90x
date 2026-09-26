import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" />
      <p className="text-text-2">Your daily missions and the 90 Grid arrive soon.</p>
    </>
  );
}
