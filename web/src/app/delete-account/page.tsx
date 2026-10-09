import type { Metadata } from "next";
import { A, Bullets, LegalPage, Part } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/trust/report-rules";

export const metadata: Metadata = {
  title: "Delete my account",
  description: "How to delete your 90x account and the data stored with it.",
};

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete my account">
      <p>You can delete your 90x account and your data yourself, in a minute. It cannot be undone.</p>

      <Part title="In the app">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-mute">
          <li>Sign in and open Me, then Settings.</li>
          <li>Scroll to Delete my account and press it.</li>
          <li>Type DELETE to confirm, then press Delete everything.</li>
        </ol>
        <p>You are signed out and sent to the front page.</p>
      </Part>

      <Part title="What is deleted">
        <Bullets>
          <li>Your sign-in record and profile (name, email, picture, timezone and preferences).</li>
          <li>Your answers and grades, check-ins and notes, missions, plan, points and progress.</li>
          <li>Your Coach chats and the memory notes Coach kept about you.</li>
          <li>Your friendships and invites, push notification address and problem reports.</li>
          <li>Your Feed queue and rate-limit counters held in Redis.</li>
        </Bullets>
        <p>A short record (email, name, dates) is kept for 90 days, then only a count.</p>
        <p>
          Encrypted nightly backups of the database are kept for 14 days, so your data is gone from them within 14 days of deletion. The AI
          spend log keeps its cost rows without anything that identifies you. Text already sent to an AI provider for grading or coaching is
          held under that provider&apos;s own terms, and we cannot delete it from there.
        </p>
      </Part>

      <Part title="Cannot sign in?">
        <p>
          Email <A href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</A> from the address on your account with the subject &quot;Delete my
          account&quot;. We will delete it by hand and confirm, within 7 days.
        </p>
      </Part>

      <Part title="Also">
        <p>
          Signing in with Google gave 90x access to your name, email and picture only. To remove that link, open your Google Account, then
          Security, then Third-party access, and remove 90x. More in the <A href="/privacy">Privacy Policy</A>.
        </p>
      </Part>
    </LegalPage>
  );
}
