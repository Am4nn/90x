import type { Metadata } from "next";
import { button } from "@/components/button-styles";
import { PageHeader } from "@/components/page-header";
import { InviteForm, PendingRequests } from "@/components/tracker/friends-ui";
import { Activity, Scoreboard } from "@/components/tracker/scoreboard";
import { requireViewer } from "@/lib/auth/viewer";
import { pendingFor, sentBy } from "@/lib/friends/service";
import { friendActivity, friendMocks, scoreboard } from "@/lib/tracker/me";

export const metadata: Metadata = { title: "Friends" };

// Header actions mirror the mock: a square `+` on phone, a labelled `Invite` on
// desktop. Both jump to the invite form further down the page. The label is
// wrapped so `hidden` (below `md`) isn't beaten by the button base's `inline-flex`.
const inviteAction = (
  <>
    <a href="#invite" aria-label="Invite a friend" className={`${button({ variant: "secondary", size: "icon-sm" })} md:hidden`}>
      <svg
        viewBox="0 0 24 24"
        className="size-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </a>
    <span className="hidden md:inline-flex">
      <a href="#invite" className={button({ variant: "secondary", size: "sm" })}>
        Invite
      </a>
    </span>
  </>
);

export default async function FriendsPage() {
  const viewer = await requireViewer();
  const [pendingReqs, sent, people, activity, mocks] = await Promise.all([
    pendingFor(viewer.email ?? ""),
    sentBy(viewer.id),
    scoreboard(viewer.id),
    friendActivity(viewer.id),
    friendMocks(viewer.id),
  ]);

  return (
    <>
      <PageHeader title="Friends" action={inviteAction} />

      <PendingRequests requests={pendingReqs.map((r) => ({ id: r.id, name: r.inviterName }))} />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-heading font-semibold">This week</h2>
              <span className="text-small text-mute">{people.length} people</span>
            </div>
            <Scoreboard people={people} />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-heading font-semibold">Activity</h2>
              <span className="text-small text-mute">Last 8</span>
            </div>
            <Activity items={activity} mocks={mocks} timezone={viewer.timezone} />
          </section>
        </div>

        <section id="invite" className="flex flex-col gap-3">
          <InviteForm sent={sent} yourName={viewer.name} />
        </section>
      </div>
    </>
  );
}
