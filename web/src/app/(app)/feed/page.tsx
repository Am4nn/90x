import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Feed" };

export default function FeedPage() {
  return (
    <>
      <PageHeader title="Feed" />
      <p className="text-text-2">Question cards arrive soon.</p>
    </>
  );
}
