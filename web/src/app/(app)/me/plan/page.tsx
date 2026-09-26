import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FocusForm, LengthForm, StartCampaignForm, TemplateEditor } from "@/components/tracker/plan-forms";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { activeCampaign, topCompanies } from "@/lib/tracker/campaign";
import { addDays, daysBetween, localDate } from "@/lib/tracker/dates";
import type { Templates } from "@/lib/tracker/template";

export const metadata: Metadata = { title: "Plan" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-heading font-semibold">{title}</h2>
        {hint && <p className="text-small text-mute">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function PlanPage() {
  const viewer = await requireViewer();
  const [campaign, companies, [profile]] = await Promise.all([
    activeCampaign(viewer.id),
    topCompanies(),
    db.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, viewer.id)),
  ]);
  const back = (
    <Link href="/me" className="text-small font-semibold text-text-2 hover:text-text">
      Done
    </Link>
  );

  if (!campaign) {
    return (
      <>
        <PageHeader title="Plan" action={back} />
        <Section title="Start your campaign" hint="Pick a length and how much time you have. 90x proposes a daily plan you can edit here.">
          <StartCampaignForm />
        </Section>
      </>
    );
  }

  const today = localDate(profile?.timezone ?? "UTC");
  const day = daysBetween(campaign.startDate, today) + 1;
  const focus = campaign.companyFocus as { company: string; from: string; to: string } | null;
  const activeFocus = focus && focus.to >= today ? { company: focus.company, to: focus.to } : null;

  return (
    <>
      <PageHeader title="Plan" action={back} />
      <Section
        title="Campaign"
        hint={`Day ${day} of ${campaign.lengthDays} · ends ${addDays(campaign.startDate, campaign.lengthDays - 1)}. Past days keep their squares.`}
      >
        <LengthForm current={campaign.lengthDays} minimum={day} />
      </Section>
      <Section title="Daily template" hint="How many of each mission every weekday gets. Changes apply from tomorrow.">
        <TemplateEditor initial={campaign.templates as Templates} />
      </Section>
      <Section title="Company focus" hint="Boosts that company's problems in new-problem missions for a while.">
        <FocusForm companies={companies} current={activeFocus} />
      </Section>
    </>
  );
}
