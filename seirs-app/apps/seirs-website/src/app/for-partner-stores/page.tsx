import type { Metadata } from "next";
import {
  Store,
  Banknote,
  ScanLine,
  Calendar,
  Footprints,
  PauseCircle,
  ShieldCheck,
  PackageCheck,
  TrendingUp,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { PageHero, PageCta } from "@/components/PageHero";
import { getPageBlock, getImageSlots } from "@/lib/cms";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Partner Stores",
  description:
    "Turn your shop into a Seirs drop-off point. Earn a per-package fee on everything you handle, drive foot traffic, and see every naira itemised in your in-app statements. Open to existing Nigerian businesses with shopfront space.",
};

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="lift bg-white rounded-2xl border border-gray-200 p-7 shadow-sm h-full">
      <div className="w-11 h-11 rounded-xl bg-success-green/15 flex items-center justify-center mb-4">
        <Icon size={20} className="text-success-green" strokeWidth={1.75} />
      </div>
      <h3 className="text-navy font-bold text-lg mb-2">{title}</h3>
      <p className="text-text-muted text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function StatBlock({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="text-navy font-extrabold text-4xl md:text-5xl mb-2">
        {value}
      </div>
      <div className="text-text-muted text-sm">{label}</div>
    </div>
  );
}

function CheckRow({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-b-0">
      <CheckCircle
        size={18}
        className="text-success-green flex-shrink-0 mt-0.5"
        strokeWidth={2}
      />
      <span className="text-text-dark text-sm leading-relaxed">{children}</span>
    </li>
  );
}

export default async function ForPartnerStoresPage() {
  const [hero, img] = await Promise.all([getPageBlock('hero_for_partner_stores'), getImageSlots()]);
  return (
    <>
      <PageHero
        heroImageUrl={hero?.coverImageUrl ?? null}
        eyebrow="Earn From Your Shop"
        title={
          <>
            Turn your shop into a
            <br />
            <span className="text-sky">Seirs drop-off point.</span>
          </>
        }
        subtitle="Already running a kiosk, supermarket, pharmacy, or any neighbourhood shopfront? Become a Seirs Partner Store. Earn for every package you handle, drive foot traffic, and watch every naira on your statement. No upfront cost."
        icon={Store}
        primaryCtaLabel="Apply to be a partner"
        primaryCtaHref="/contact"
        secondaryCtaLabel="See how it works"
        secondaryCtaHref="/how-it-works"
      />

      {/* Headline numbers */}
      <section className="py-16 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatBlock value="Per-package" label="Fee on every handoff" />
            <StatBlock value="Itemised" label="In-app statements" />
            <StatBlock value="₦0" label="Setup or monthly fee" />
            <StatBlock value="Fast" label="Application review" />
          </div>
        </div>
      </section>

      {(img.img_store_counter || img.img_store_shelf) && (
        <section className="py-10 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {img.img_store_counter && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.img_store_counter} alt="Receiving parcels at the counter" className="w-full rounded-card object-cover max-h-64" loading="lazy" />
            )}
            {img.img_store_shelf && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.img_store_shelf} alt="Package shelf" className="w-full rounded-card object-cover max-h-64" loading="lazy" />
            )}
          </div>
        </section>
      )}

      {/* Why it works */}
      <section className="py-20 bg-off-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Why Partner</p>
            <h2 className="section-title mb-4">
              A side income with no extra effort
            </h2>
            <p className="section-sub">
              You&apos;re already at the shop. Now your shop earns from
              packages too.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Banknote}
              title="Earn on every package"
              body="Every package your shop receives, holds, or releases earns a fee, recorded on your statement the moment the handoff completes. Storage fees apply when senders overstay: also yours."
            />
            <FeatureCard
              icon={Calendar}
              title="Every naira accounted for"
              body="Your earnings ledger lives in the app: every package, every fee, every day of storage, itemised. Payout details are agreed at onboarding: no chasing anyone for what you are owed."
            />
            <FeatureCard
              icon={Footprints}
              title="Foot traffic into your shop"
              body="Customers come to you to drop or collect packages, and often buy something while they&apos;re there. Free customer acquisition you didn&apos;t pay for."
            />
            <FeatureCard
              icon={PauseCircle}
              title="Pause whenever you want"
              body="Closing for stock day, family event, or holidays? Tap once to pause new package acceptance. Resume anytime. You&apos;re in control of capacity."
            />
            <FeatureCard
              icon={ScanLine}
              title="Simple QR scan workflow"
              body="Open the Business app, scan the customer&apos;s package QR code on drop-off, scan again on pickup. No paperwork, no manual entry."
            />
            <FeatureCard
              icon={PackageCheck}
              title="Capacity dashboard"
              body="See at a glance how many packages you&apos;re holding, how long they&apos;ve been there, and which ones need to be released soon. Never lose track."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Protected custody"
              body="Every package you hold is logged with photos, codes, and a chain-of-custody record. If something goes wrong that isn&apos;t your doing, the evidence is already on your side."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Earnings dashboard"
              body="See today&apos;s earnings, this week, this month, broken down by package type. Forecast your monthly side income."
            />
            <FeatureCard
              icon={Store}
              title="Featured in customer search"
              body="Customers nearby will see your shop in the Seirs Customer app when picking a drop-off point, your shop name, photo, and hours displayed."
            />
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Eligibility</p>
            <h2 className="section-title mb-4">What we look for</h2>
          </div>

          <div className="bg-off-white rounded-2xl border border-gray-200 p-8">
            <ul>
              <CheckRow>
                A registered shop, kiosk, supermarket, pharmacy, or similar in Nigeria
              </CheckRow>
              <CheckRow>
                Open at least 6 days a week with predictable hours
              </CheckRow>
              <CheckRow>
                Storage space for at least 10 packages at any given time
              </CheckRow>
              <CheckRow>
                A working Android smartphone for the Seirs Business app
              </CheckRow>
              <CheckRow>
                Valid CAC business registration OR personal NIN if running as sole trader
              </CheckRow>
              <CheckRow>
                A Nigerian bank account in the business or owner&apos;s name
              </CheckRow>
              <CheckRow>
                A clear, well-lit shopfront accessible from a main road
              </CheckRow>
            </ul>
            <p className="text-text-muted text-xs mt-6 leading-relaxed">
              Don&apos;t tick every box? Apply anyway, we&apos;ll let you know
              what&apos;s missing and how to address it. We&apos;re actively
              expanding across Nigeria and want to hear from every interested
              shop owner.
            </p>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-20 bg-off-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Getting Started</p>
            <h2 className="section-title mb-4">From application to first ₦</h2>
          </div>

          <div className="space-y-6">
            {[
              {
                step: 1,
                title: "Submit your application",
                body: "Fill out our short form (5 minutes). Tell us about your shop, location, and capacity.",
              },
              {
                step: 2,
                title: "Quick virtual walkthrough",
                body: "Our partner success team calls you, asks for shopfront photos, confirms your hours and capacity. Usually within 24 hours of applying.",
              },
              {
                step: 3,
                title: "Set up the Business app",
                body: "We onboard you on a video call, set up your account, link your bank, do a test scan. Takes 20 minutes.",
              },
              {
                step: 4,
                title: "Customers start dropping packages",
                body: "Your shop appears in the customer app's nearby drop-off list. First package usually arrives within a week of activation.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="bg-white rounded-2xl border border-gray-200 p-6 flex gap-5"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-success-green text-white flex items-center justify-center font-extrabold">
                  {s.step}
                </div>
                <div>
                  <h4 className="text-navy font-bold text-lg mb-1">
                    {s.title}
                  </h4>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Earnings example */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="section-label mb-3">How Earnings Build</p>
            <h2 className="section-title mb-4">Simple math, no surprises</h2>
          </div>

          {/* Honesty rule 2026-08-11: the previous version invented
              monthly earnings "based on last quarter's partner data" for
              a network that hasn't launched. Real partner earnings take
              this slot once real partners have real quarters. */}
          <div className="bg-off-white rounded-2xl border border-gray-200 p-8">
            <div className="space-y-4 max-w-xl mx-auto">
              {[
                { n: "1", text: "You earn a per-package fee on every drop-off, hold, and collection your shop handles: the exact rate is agreed at onboarding, in writing." },
                { n: "2", text: "Senders who overstay the free storage window pay daily storage fees: those are yours too." },
                { n: "3", text: "Every package and fee appears on your in-app statement the moment it happens. The busier your street, the more your shelf earns." },
              ].map((s) => (
                <div key={s.n} className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-navy text-white font-bold text-sm rounded-lg flex items-center justify-center flex-shrink-0">{s.n}</div>
                  <p className="text-text-dark text-sm leading-relaxed pt-1">{s.text}</p>
                </div>
              ))}
            </div>
            <p className="text-text-muted text-xs text-center mt-6">
              We publish real partner earning figures once our first partners have
              real months behind them: not before.
            </p>
          </div>
        </div>
      </section>

      <PageCta
        title="Turn your shop into income"
        subtitle="Apply now. Our partner team reviews every application personally and gets back to you with the next steps."
        primaryLabel="Apply to be a partner"
        primaryHref="/contact"
      />
    </>
  );
}
