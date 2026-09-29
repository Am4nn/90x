import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { InviteForm, PendingRequests } from "@/components/tracker/friends-ui";
import { Activity, Scoreboard } from "@/components/tracker/scoreboard";
import { requireViewer } from "@/lib/auth/viewer";
import { pendingFor, sentBy } from "@/lib/friends/service";
import { friendActivity, friendMocks, scoreboard } from "@/lib/tracker/me";

export const metadata: Metadata = { title: "Friends" };

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
      <PageHeader title="Friends" />

      <PendingRequests requests={pendingReqs.map((r) => ({ id: r.id, name: r.inviterName }))} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-heading font-semibold">This week</h2>
            <Scoreboard people={people} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-heading font-semibold">Activity</h2>
            <Activity items={activity} mocks={mocks} />
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <InviteForm sent={sent} yourName={viewer.name} />
        </section>
      </div>
    </>
  );
}
