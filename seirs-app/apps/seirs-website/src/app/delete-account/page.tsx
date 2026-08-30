import type { Metadata } from "next";
import Link from "next/link";
import { Trash2, Mail, Smartphone, Clock, Archive } from "lucide-react";

/**
 * Account deletion request page.
 *
 * Google Play requires a publicly reachable URL, outside the app, where
 * someone can request account and data deletion without installing
 * anything. It is listed in the Play Console Data Safety form, and the
 * store audit on 2026-08-30 found the site had no such route.
 *
 * What this page says must match what the in-app screens actually do and
 * what the Data Safety form declares: soft delete now, 30-day grace, hard
 * delete after, with a named list of what is retained and why.
 */
export const metadata: Metadata = {
  title: "Delete Your Account",
  description:
    "How to delete your SEIRS account and personal data, what is removed, what is retained by law, and how long it takes.",
};

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-9">
      <h2 className="text-xl font-bold text-navy mb-4 pb-2 border-b border-gray-100 flex items-center gap-2.5">
        <span className="text-sky">{icon}</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function DeleteAccountPage() {
  return (
    <div className="bg-off-white min-h-screen">
      <div className="bg-navy py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-sky/20 rounded-xl flex items-center justify-center">
              <Trash2 size={20} className="text-sky" />
            </div>
            <div className="text-sky text-sm font-semibold tracking-wider uppercase">
              Your data
            </div>
          </div>
          <h1 className="text-title-sm lg:text-title-lg font-extrabold text-white mb-3">
            Delete your account
          </h1>
          <p className="text-white/70 text-base max-w-2xl">
            You can delete your SEIRS account and personal data at any time, from
            inside the app or by writing to us. Here is exactly what happens.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-7 sm:p-9">

          <Section title="From inside the app, fastest" icon={<Smartphone size={18} />}>
            <p className="text-text-muted leading-relaxed">
              Open the SEIRS app you signed up in, go to <strong className="text-navy">Profile</strong>,
              then <strong className="text-navy">Delete Account</strong>. You confirm with your password
              and by typing a short phrase, so it cannot happen by accident.
            </p>
            <p className="text-text-muted leading-relaxed">
              Before you confirm, the same screen offers a copy of your data to take with you.
            </p>
          </Section>

          <Section title="By email, if you cannot sign in" icon={<Mail size={18} />}>
            <p className="text-text-muted leading-relaxed">
              Write to{" "}
              <a href="mailto:privacy@seirs.co" className="text-sky font-semibold underline">
                privacy@seirs.co
              </a>{" "}
              from the email address on the account, with the subject{" "}
              <strong className="text-navy">Delete my account</strong>. Include your SEIRS ID if you
              have it to hand.
            </p>
            <p className="text-text-muted leading-relaxed">
              We reply within 5 working days. We may ask one question to confirm it is really you,
              because an account holds delivery addresses and payout details and we will not delete
              one on an unverified request.
            </p>
          </Section>

          <Section title="What happens, and when" icon={<Clock size={18} />}>
            <p className="text-text-muted leading-relaxed">
              Your account is deactivated <strong className="text-navy">immediately</strong>. You are
              signed out, you stop receiving notifications, and nobody can book with the account.
            </p>
            <p className="text-text-muted leading-relaxed">
              It is then permanently deleted after{" "}
              <strong className="text-navy">30 days</strong>. That window exists so a mistake can be
              undone: sign back in before it expires and the account is restored exactly as it was.
              After 30 days it cannot be recovered by us or by you.
            </p>
            <p className="text-text-muted leading-relaxed">
              Finish anything in flight first. A delivery still on the road, or a package waiting at a
              partner store, has to complete or be cancelled before the account can close.
            </p>
          </Section>

          <Section title="What is deleted" icon={<Trash2 size={18} />}>
            <ul className="space-y-2 text-text-muted">
              {[
                "Your name, phone number, email address and profile photo",
                "Your saved addresses and delivery history",
                "Saved card tokens and, for drivers and partner stores, bank payout details",
                "Loyalty points and tier, which cannot be transferred or paid out",
                "For businesses: API keys, webhook endpoints and saved runs",
                "For drivers: vehicle details, uploaded documents and ratings",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="text-sky mt-1.5 flex-shrink-0">&bull;</span>
                  <span className="leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="What we keep, and why" icon={<Archive size={18} />}>
            <p className="text-text-muted leading-relaxed">
              A small amount of information survives deletion because the law requires it or because
              somebody else has a claim on it. We keep the minimum, and it is never used to market to
              you.
            </p>
            <ul className="space-y-2 text-text-muted mt-3">
              {[
                "Records tied to an open dispute or investigation, until it is resolved",
                "Transaction and tax records we are legally required to retain",
                "Anonymised delivery statistics, which cannot identify you",
                "The other side of a shared handoff: a delivery you sent still appears in the recipient's or driver's own record",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="text-sky mt-1.5 flex-shrink-0">&bull;</span>
                  <span className="leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </Section>

          <div className="mt-10 pt-7 border-t border-gray-100 text-sm text-text-muted">
            More detail on what we hold and why is in the{" "}
            <Link href="/privacy-policy" className="text-sky font-semibold underline">
              Privacy Policy
            </Link>
            . Questions about a specific request go to{" "}
            <a href="mailto:privacy@seirs.co" className="text-sky font-semibold underline">
              privacy@seirs.co
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
