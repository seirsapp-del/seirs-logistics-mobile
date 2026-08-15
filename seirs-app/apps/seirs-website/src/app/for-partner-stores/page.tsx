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
import { StoryRow } from "@/components/StoryRow";

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
        primaryCtaHref="/contact?subject=partner"
        secondaryCtaLabel="See how it works"
        secondaryCtaHref="/how-it-works"
      />

      {/* Headline numbers */}
      <section className="py-section-sm lg:py-section-lg bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatBlock value="Per-package" label="Fee on every handoff" />
            <StatBlock value="Itemised" label="In-app statements" />
            <StatBlock value="₦0" label="Setup or monthly fee" />
            <StatBlock value="Fast" label="Application review" />
          </div>
        </div>
      </section>

      {/* Story rows: what actually happens behind your counter. */}
      <section className="py-section-sm lg:py-section-lg bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <StoryRow
            imageUrl={img.img_store_counter}
            alt="Logging a parcel at the shop counter"
            eyebrow="At the counter"
            title="A customer walks in, you scan, they leave"
            body="Someone drops a package at your shop or comes to collect one. You open the app, scan the code, take the photo it asks for, and the handoff is recorded. Ten seconds of work, and the fee lands on your statement before the customer is out the door."
            points={[
              'Any staff member can be shown the whole flow in ten minutes',
              'The app tells you who the package belongs to and who may collect it',
              'Every scan is logged, so nothing depends on anyone remembering',
            ]}
          />
          <StoryRow
            imageUrl={img.img_store_shelf}
            alt="Shelf of packages waiting for collection"
            flip
            eyebrow="Behind the counter"
            title="You always know what you are holding"
            body="Packages sit on your shelf with a clock running on each one. The capacity board shows how many you hold, how long each has been there, and which ones need to move: no guessing, no packages lost behind the fridge for three weeks."
            points={[
              'Set your own capacity so you are never over-filled',
              'Pause new drop-offs with one tap on a busy day',
              'Storage beyond the free window earns you a holding fee',
            ]}
          />
        </div>
      </section>

      {/* Why it works */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
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
      <section className="py-section-sm lg:py-section-lg bg-white">
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
                A working smartphone for the Seirs Business app
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
      {/* "Getting Started" (the four-step onboarding walkthrough) and "How
          Earnings Build" (the fee mechanics) removed 2026-08-15. Founder:
          together they published the full template of how the company runs,
          the same over-disclosure cut from the homepage feature cards and
          the partner four-step. An applicant hears all of it from the
          partner team during the application, which is where it belongs.
          In their place: one admin-replaceable image (img_partner_apply,
          falling back to img_partner_store), so the page closes on a
          picture of the life rather than the mechanics. */}
      {(img.img_partner_apply || img.img_partner_store) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img.img_partner_apply ?? img.img_partner_store}
          alt="A Seirs partner store serving customers"
          className="w-full h-56 sm:h-72 lg:h-96 object-cover"
          loading="lazy"
        />
      )}

      <PageCta
        title="Turn your shop into income"
        subtitle="Apply now. Our partner team reviews every application personally and gets back to you with the next steps."
        primaryLabel="Apply to be a partner"
        primaryHref="/contact?subject=partner"
      />
    </>
  );
}
