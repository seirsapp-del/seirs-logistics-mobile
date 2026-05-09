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

export const metadata: Metadata = {
  title: "Partner Stores",
  description:
    "Turn your shop into a Seirs drop-off point. Earn ₦500 per package collected, drive foot traffic, get paid weekly. Open to existing Nigerian businesses with shopfront space.",
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
    <div className="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm h-full">
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

export default function ForPartnerStoresPage() {
  return (
    <>
      <PageHero
        eyebrow="Earn From Your Shop"
        title={
          <>
            Turn your shop into a
            <br />
            <span className="text-sky">Seirs drop-off point.</span>
          </>
        }
        subtitle="Already running a kiosk, supermarket, pharmacy, or any neighbourhood shopfront? Become a Seirs Partner Store. Earn for every package you collect, drive foot traffic, get paid weekly. No upfront cost."
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
            <StatBlock value="₦500" label="Per package collected" />
            <StatBlock value="Weekly" label="Automatic payouts" />
            <StatBlock value="₦0" label="Setup or monthly fee" />
            <StatBlock value="48 hrs" label="Average approval time" />
          </div>
        </div>
      </section>

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
              title="Earn ₦500 per package"
              body="Every package a customer drops off or picks up at your shop earns you ₦500 — credited to your Seirs wallet the moment the handoff completes."
            />
            <FeatureCard
              icon={Calendar}
              title="Weekly payouts to your bank"
              body="Earnings auto-transfer to your linked Nigerian bank account every Friday. No paperwork, no chase-ups, no minimum balance to withdraw."
            />
            <FeatureCard
              icon={Footprints}
              title="Foot traffic into your shop"
              body="Customers come to you to drop or collect packages — and often buy something while they&apos;re there. Free customer acquisition you didn&apos;t pay for."
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
              title="Insured packages"
              body="All packages held at your shop are covered by Seirs insurance — so you&apos;re never personally liable for damage or loss while in your custody."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Earnings dashboard"
              body="See today&apos;s earnings, this week, this month — broken down by package type. Forecast your monthly side income."
            />
            <FeatureCard
              icon={Store}
              title="Featured in customer search"
              body="Customers nearby will see your shop in the Seirs Customer app when picking a drop-off point — your shop name, photo, and hours displayed."
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
              Don&apos;t tick every box? Apply anyway — we&apos;ll let you know
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
                body: "We onboard you on a video call — set up your account, link your bank, do a test scan. Takes 20 minutes.",
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
            <p className="section-label mb-3">Real Numbers</p>
            <h2 className="section-title mb-4">What partners typically earn</h2>
          </div>

          <div className="bg-off-white rounded-2xl border border-gray-200 p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-2">
                  Light traffic shop
                </div>
                <div className="text-navy font-extrabold text-3xl mb-1">
                  ₦15,000
                </div>
                <div className="text-text-muted text-xs">
                  /month · ~30 packages/wk
                </div>
              </div>
              <div className="md:border-x border-gray-200 md:px-6">
                <div className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-2">
                  Steady neighbourhood spot
                </div>
                <div className="text-success-green font-extrabold text-3xl mb-1">
                  ₦40,000
                </div>
                <div className="text-text-muted text-xs">
                  /month · ~80 packages/wk
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-2">
                  Busy main-road shop
                </div>
                <div className="text-sky font-extrabold text-3xl mb-1">
                  ₦80,000+
                </div>
                <div className="text-text-muted text-xs">
                  /month · ~160 packages/wk
                </div>
              </div>
            </div>
            <p className="text-text-muted text-xs text-center mt-6">
              Indicative monthly earnings based on partner-store data from Lagos
              and Abuja over the last quarter. Actuals depend on your location,
              hours, and customer volume nearby.
            </p>
          </div>
        </div>
      </section>

      <PageCta
        title="Turn your shop into income"
        subtitle="Apply now. Our partner team will get back to you within 24 hours with the next steps."
        primaryLabel="Apply to be a partner"
        primaryHref="/contact"
      />
    </>
  );
}
