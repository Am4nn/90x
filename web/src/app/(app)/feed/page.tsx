import type { Metadata } from "next";
import { Feed, type Screen } from "@/components/feed/feed";
import { requireViewer } from "@/lib/auth/viewer";
import { diagnosticState, emptyReason, feedAreas, nextCard, sessionStats } from "@/lib/feed/service";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  const viewer = await requireViewer();
  const [areas, diagnostic, session] = await Promise.all([feedAreas(viewer.id), diagnosticState(viewer.id), sessionStats(viewer.id)]);

  let initial: Screen = { kind: "offer" };
  if (diagnostic !== "offer") {
    const card = await nextCard(viewer.id);
    initial = card ? { kind: "card", card } : { kind: "empty", reason: await emptyReason(viewer.id) };
  }

  return <Feed initial={initial} areas={areas} session={session} />;
}
