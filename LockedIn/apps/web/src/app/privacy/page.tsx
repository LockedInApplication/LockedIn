import type { Metadata } from "next";
import Link from "next/link";
import { togetherReportingProfileHref } from "@/features/journey/journey.navigation";
import styles from "./privacy.module.scss";

export const metadata: Metadata = {
  title: "Together privacy notice | LockedIn",
  description: "What LockedIn counts in the Together pilot, what stays private, and how either partner can opt out.",
};

export default function TogetherPrivacyNotice() {
  return <main className={styles.page}>
    <Link href="/" className={styles.back}>← Back to LockedIn</Link>
    <article className={styles.notice} aria-labelledby="privacy-title">
      <header>
        <p className={styles.eyebrow}>LockedIn · Privacy</p>
        <h1 id="privacy-title">Together privacy notice</h1>
        <p>We use weekly totals to understand which parts of Together are useful. Only couples who both agreed to the pilot are counted, and only for activity after they joined it.</p>
      </header>

      <section aria-labelledby="what-we-count">
        <h2 id="what-we-count">What we count</h2>
        <ul>
          <li>Plans suggested, accepted, and marked done.</li>
          <li>Memories saved from those plans, and whether the other partner adds a detail.</li>
          <li>Whether a couple makes another memory they both contribute to 7–30 days later.</li>
        </ul>
        <p>We use dates and internal account and pair IDs to count each action and avoid counting the same couple twice in a total.</p>
      </section>

      <section aria-labelledby="what-stays-private">
        <h2 id="what-stays-private">What stays private</h2>
        <p>For this report, we don’t read or copy names, email addresses, plan titles, messages, reflections, note text, photos, or recordings.</p>
        <p>Only authorized LockedIn operators can request the report. It shows totals across couples, without IDs or individual activity. We don’t show totals for groups with fewer than five eligible couples.</p>
      </section>

      <section aria-labelledby="reporting-choice">
        <h2 id="reporting-choice">Your reporting choice</h2>
        <p>Either partner can opt out privately at any time. This excludes your Together spaces from future reports, including reruns for earlier weeks. It won’t delete anything, change who can see what you share, or notify your partner. You can keep using Together normally.</p>
        <Link href={togetherReportingProfileHref} className={styles.action}>Manage Together reporting</Link>
      </section>
    </article>
  </main>;
}
