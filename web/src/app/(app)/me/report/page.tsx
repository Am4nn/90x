import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { cleanPath } from "@/lib/trust/report-rules";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report a problem" };

export default async function ReportPage({ searchParams }: PageProps<"/me/report">) {
  await requireViewer();
  const { from } = await searchParams;
  // The page the person came from, which is what the report is about. It is also where Back goes.
  const origin = cleanPath(Array.isArray(from) ? from[0] : from);
  return (
    <>
      <BackLink href="/me/settings">Settings</BackLink>
      <PageHeader title="Report a problem" />
      <div className="max-w-xl">
        <ReportForm from={origin} />
      </div>
    </>
  );
}
