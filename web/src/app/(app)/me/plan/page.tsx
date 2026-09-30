import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/button-styles";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { FocusForm, PlanEditor, StartPlanForm } from "@/components/tracker/plan-forms";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { activeCampaign, topCompanies } from "@/lib/tracker/campaign";
import { daysBetween, localDate } from "@/lib/tracker/dates";
import { asLevel } from "@/lib/tracker/level";
import type { Templates } from "@/lib/tracker/template";

export const metadata: Metadata = { title: "Plan" };

/** The stored time, shown as-is even when it isn't a chip (a value from before
 *  the chips existed, or the e2e fixture's 95): a fallback would misstate the
 *  real plan and let Rebuild silently rewrite it. Only a missing value uses the
 *  default. */
function budgetOr(value: number | null | undefined, fallback: string) {
  return value == null ? fallback : String(value);
}

export default async function PlanPage() {
  const viewer = await requireViewer();
  const [campaign, companies, [profile]] = await Promise.all([
    activeCampaign(viewer.id),
    topCompanies(),
    db
      .select({
        timezone: profiles.timezone,
        level: profiles.level,
        weekdayMinutes: profiles.weekdayMinutes,
        weekendMinutes: profiles.weekendMinutes,
      })
      .from(profiles)
      .where(eq(profiles.userId, viewer.id)),
  ]);
  // The mock's only "Done" is the desktop ghost; phones get back via the tab bar.
  const back = (
    <span className="hidden md:inline-flex">
      <Link href="/me" className={button({ variant: "ghost", size: "sm" })}>
        Done
      </Link>
    </span>
  );

  const today = localDate(profile?.timezone ?? "UTC");
  // No level means nobody asked, and null plans exactly as `some_practice`, so
  // that is what the chips show until the reader picks for themselves.
  const level = asLevel(profile?.level) ?? "some_practice";
  const weekday = budgetOr(profile?.weekdayMinutes, "120");
  const weekend = budgetOr(profile?.weekendMinutes, "180");
  const ended = campaign && daysBetween(campaign.startDate, today) >= campaign.lengthDays;

  if (!campaign || ended) {
    return (
      <>
        <PageHeader title="Plan" action={back} />
        <Section
          title={ended ? "Start a new plan" : "Start your plan"}
          hint={
            ended
              ? "Your last plan is over; its days stay on your history. Pick a level, a length and your daily time for the next one."
              : "Pick a level, a length and how much time you have a day. 90x proposes a week you can adjust here."
          }
          className="flex flex-col gap-3"
        >
          <StartPlanForm level={level} weekday={weekday} weekend={weekend} />
        </Section>
      </>
    );
  }

  const day = daysBetween(campaign.startDate, today) + 1;
  const focus = campaign.companyFocus as { company: string; from: string; to: string } | null;
  const activeFocus = focus && focus.to >= today ? { company: focus.company, to: focus.to } : null;

  return (
    <>
      <PageHeader title="Plan" action={back} />
      <PlanEditor
        level={level}
        weekday={weekday}
        weekend={weekend}
        length={campaign.lengthDays}
        minimum={day}
        startDate={campaign.startDate}
        templates={campaign.templates as Templates}
      />
      <Section
        title="Company focus"
        hint="Boosts that company's problems in new-problem missions for a while."
        className="flex flex-col gap-3"
      >
        <FocusForm companies={companies} current={activeFocus} />
      </Section>
    </>
  );
}
