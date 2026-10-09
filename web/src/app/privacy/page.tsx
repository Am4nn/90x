import type { Metadata } from "next";
import { A, Bullets, LegalPage, Part } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/trust/report-rules";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What 90x collects, who processes it, how long it is kept, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        90x is an interview-prep coach: a Feed of graded cards, a daily plan, a Library and a Coach you can chat with. It is a free personal
        project. This page says what the app collects, why, who else handles it, and what you can do about it.
      </p>

      <Part title="What we collect">
        <Bullets>
          <li>
            <strong className="text-text">Sign-in.</strong> You sign in with Google. Google gives us your name, email address and profile
            picture. We never see your Google password.
          </li>
          <li>
            <strong className="text-text">Your profile.</strong> Your timezone, preferred language, level, how many minutes you can study,
            how long your plan runs, the topics you picked, your notification choices and, if you add it, your LeetCode username.
          </li>
          <li>
            <strong className="text-text">What you do in the app.</strong> Your answers to Feed cards and how they were graded, check-ins
            and the notes you add to them, missions and progress, points, mock interview records, stories you write, and the lessons you
            open.
          </li>
          <li>
            <strong className="text-text">Coach.</strong> Your chats with the Coach and the short memory notes it keeps about you (such as a
            habit or a weak spot) so it can help better next time. You can read and remove these in Me, then Settings, then &quot;What Coach
            knows&quot;.
          </li>
          <li>
            <strong className="text-text">Friends.</strong> If you invite or accept a friend, we store the invite (their email address) and
            the link between you. A friend you accept can see your name, picture and progress figures, such as check-ins and mock scores.
            They cannot read your answers, notes or Coach chats.
          </li>
          <li>
            <strong className="text-text">Notifications.</strong> If you turn on push notifications, we store the address your browser or
            phone gives us for them.
          </li>
          <li>
            <strong className="text-text">Problem reports.</strong> What you write, plus the page, browser and app version, when you use
            Report a problem.
          </li>
          <li>
            <strong className="text-text">Technical data.</strong> Like any website, our host sees your IP address and browser details when
            a page loads. Error reports (a technical description of what broke) and page-speed measurements are collected without your name
            or email. Counters that stop one account from overusing a feature are kept against your account ID.
          </li>
        </Bullets>
      </Part>

      <Part title="Cookies and storage on your device">
        <p>
          We set the cookies that keep you signed in (Supabase Auth session cookies). They are essential: without them the app cannot know
          who you are. One more first-party cookie notes where your first visit came from (for example a LinkedIn link), so we can see which
          posts bring people in; it is saved once to your profile when you sign up and then deleted, and it expires after 30 days if you
          never sign up. When you press a sign-in button, a cookie notes which one for an hour, so we can count sign-ups from each place; it
          is deleted once you are signed in. We use no advertising or cross-site tracking cookies. Vercel Web Analytics counts visits
          without cookies and without following you across sites. The try page counts what visitors do on it (answers, plays, time on the
          page) with a random id that lives only for that visit: no cookie, no account, no address. The app also stores a few preferences
          and an offline copy of pages and cards in your browser so it works on a train. Signing out or visiting the landing page clears the
          offline copy.
        </p>
      </Part>

      <Part title="Why we use it">
        <p>
          To run the app: sign you in, grade your answers, plan your days, answer you as the Coach, send the notifications you asked for,
          show friends the progress you agreed to share, keep the service secure and within its limits, and answer your reports. We do not
          sell your data and we show no ads.
        </p>
      </Part>

      <Part title="Who else handles it">
        <p>We use these services to run 90x. Each only gets what it needs for its job.</p>
        <Bullets>
          <li>
            <strong className="text-text">Supabase</strong>: database and sign-in, hosted in the Mumbai region.
          </li>
          <li>
            <strong className="text-text">Vercel</strong>: hosting (Mumbai region), plus Web Analytics and Speed Insights.
          </li>
          <li>
            <strong className="text-text">Upstash</strong>: Redis and QStash, for short-lived state such as your Feed queue, rate limits and
            scheduled jobs.
          </li>
          <li>
            <strong className="text-text">Third-party AI model providers</strong>: when you submit an answer for grading, ask the Coach
            something or request a review, the text needed for that task (your answer or code, your message, the relevant card or problem,
            and your Coach memory notes and progress summary) is sent to an AI model provider by API. The provider is set in our
            configuration and can change; the app supports DeepSeek and Anthropic and any OpenAI-compatible service. We do not send your
            email address. Each provider handles that text under its own terms. AI output can be wrong, so do not treat it as authoritative.
          </li>
          <li>
            <strong className="text-text">Resend</strong>: sends the few emails the app sends, such as friend invites, account emails
            (you&apos;re in, account deleted), and reports to the owner.
          </li>
          <li>
            <strong className="text-text">Apple, Google and Mozilla push services</strong>: carry push notifications to your device if you
            turn them on.
          </li>
          <li>
            <strong className="text-text">Sentry</strong>: receives error reports when something breaks, when it is switched on.
          </li>
          <li>
            <strong className="text-text">Google</strong>: signs you in. <strong className="text-text">LeetCode</strong>: if you turn on
            activity sync, your LeetCode username is sent to LeetCode&apos;s public pages to read your public submissions.
          </li>
        </Bullets>
        <p>Some of these companies run servers outside India, so your data can leave India.</p>
      </Part>

      <Part title="How long we keep it">
        <p>
          Until you delete your account. Deleting it (see <A href="/delete-account">Delete my account</A>) removes your profile, answers,
          check-ins, Coach chats and memory, friendships, push address, points, reports and sign-in record from our live database straight
          away. Short-lived copies in Redis expire on their own. Encrypted nightly backups of the database are kept for 14 days, so deleted
          data is gone from them within 14 days. We keep the AI spend log without anything that identifies you, because it is how we watch
          our budget. Logs kept by our host follow its retention. Emails already sent stay in Resend&apos;s log for its retention period.
        </p>
        <p>
          When an account is deleted, we keep a short record for 90 days: its email, name, the dates it was created and deleted, and whether
          you or an admin deleted it, so we can answer questions about it. After 90 days the record is removed and only a count of deleted
          accounts remains.
        </p>
      </Part>

      <Part title="Your rights">
        <p>
          You can ask to see what we hold about you, have it corrected or have it erased. You can withdraw your consent at any time by
          deleting your account. To do any of these, use the in-app tools or contact us as described below.
        </p>
        <p>We may block or delete an account that breaks the Terms; if we delete it, we email you.</p>
      </Part>

      <Part title="Security">
        <p>
          Traffic is encrypted in transit. The database limits each person to their own rows, and AI and admin features are rate limited and
          checked on the server. No system is perfectly safe; if a breach affects you, we will tell you.
        </p>
      </Part>

      <Part title="Children">
        <p>
          90x is not intended for anyone under 18. If you are under 18, please do not use it. If we learn that we hold data about someone
          under 18, we will delete it.
        </p>
      </Part>

      <Part title="Changes">
        <p>If this policy changes in a way that matters, we will update the date at the top.</p>
      </Part>

      <Part title="Contact">
        <p>
          Contact: <A href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</A>. This is a personal project; requests are handled on a
          best-effort basis.
        </p>
      </Part>
    </LegalPage>
  );
}
