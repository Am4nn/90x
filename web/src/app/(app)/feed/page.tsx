import type { Metadata } from "next";
import { Feed, type Screen } from "@/components/feed/feed";
import { requireViewer } from "@/lib/auth/viewer";
import { diagnosticState, difficultyPreference, emptyReason, feedAreas, nextCard, sessionStats } from "@/lib/feed/service";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  const viewer = await requireViewer();
  const [areas, diagnostic, session, difficulty] = await Promise.all([
    feedAreas(viewer.id),
    diagnosticState(viewer.id),
    sessionStats(viewer.id),
    difficultyPreference(viewer.id),
  ]);

  // The diagnostic offer is a banner over the first card, so the Feed starts at once either way.
  const card = await nextCard(viewer.id);
  const initial: Screen = card ? { kind: "card", card } : { kind: "empty", reason: await emptyReason(viewer.id) };

  return (
    <Feed
      userId={viewer.id}
      initial={initial}
      offerDiagnostic={diagnostic === "offer"}
      areas={areas}
      session={session}
      difficulty={difficulty}
    />
  );
}
