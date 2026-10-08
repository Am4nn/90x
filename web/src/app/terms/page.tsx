import type { Metadata } from "next";
import { A, Bullets, LegalPage, Part } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using 90x.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms cover your use of 90x, an interview-prep coach. 90x is a free personal project, provided as is, with no warranty of any
        kind and no promise that it stays available or that anyone replies. By signing in you agree to them and to the{" "}
        <A href="/privacy">Privacy Policy</A>. If you do not agree, please do not use the app.
      </p>

      <Part title="Who can use it">
        <p>
          You must be 18 or older and have a Google account. 90x is invite-only for now: a new account waits for approval, and approval can
          be withdrawn.
        </p>
      </Part>

      <Part title="Your account">
        <p>
          You sign in with Google and are responsible for what happens under your account. Tell us if you think someone else has got into
          it. You can delete your account at any time, see <A href="/delete-account">Delete my account</A>.
        </p>
      </Part>

      <Part title="Using it fairly">
        <p>Please do not:</p>
        <Bullets>
          <li>scrape the app, copy its cards or lessons in bulk, or resell them;</li>
          <li>get around limits, approval or security, or probe the service for weaknesses;</li>
          <li>try to make the AI misbehave, or use it for anything other than your own interview prep;</li>
          <li>
            share another person&apos;s private details, or post anything unlawful or abusive (for example in Coach chats, stories or
            reports).
          </li>
        </Bullets>
        <p>We may limit or suspend an account that does.</p>
      </Part>

      <Part title="Your content">
        <p>
          What you write (answers, notes, stories, Coach messages) stays yours. You let us store it, process it and send it to our service
          providers, including AI model providers, only to run the app for you, as the Privacy Policy describes.
        </p>
      </Part>

      <Part title="AI and study content">
        <p>
          Grades, Coach replies and reviews are produced by AI and can be wrong or out of date. Cards and lessons are study aids, not an
          authority. 90x does not promise you a job, an offer or any interview result. 90x is not affiliated with LeetCode or any employer.
        </p>
      </Part>

      <Part title="The service">
        <p>
          90x is a personal project offered free and as it is. It may change, have bugs, go down for a while, or stop. We will try to give
          notice before shutting it down so you can leave with your data.
        </p>
      </Part>

      <Part title="Liability">
        <p>
          To the extent the law allows, 90x is provided without warranties, and the people who run 90x are not liable for indirect or
          consequential loss, or for anything beyond what you paid for the service, which is nothing. Nothing here limits rights you have
          that cannot be limited by contract.
        </p>
      </Part>

      <Part title="Changes">
        <p>
          We may update these terms; if the change matters, we will update the date above. Using the app after that means you accept the
          change.
        </p>
      </Part>

      <Part title="Contact">
        <p>
          Questions about these terms: see the contact line in the <A href="/privacy">Privacy Policy</A>.
        </p>
      </Part>
    </LegalPage>
  );
}
