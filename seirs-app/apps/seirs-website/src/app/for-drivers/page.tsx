import type { Metadata } from "next";
import {
  Truck,
  Zap,
  CarTaxiFront,
  Clock,
  ShieldCheck,
  MapPin,
  TrendingUp,
  Bike,
  Car,
  Banknote,
  CheckCircle,
  FileBadge,
  type LucideIcon,
} from "lucide-react";
import { PageHero, PageCta } from "@/components/PageHero";
import { getPageBlock, getImageSlots } from "@/lib/cms";
import { StoryRow } from "@/components/StoryRow";
import { STORE } from "@/lib/launch";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "For Drivers",
  description:
    "Drive with SEIRS and earn on your terms. Daily wallet payouts, smart routing, real support. Join Nigeria's smartest last-mile delivery network.",
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
      <div className="w-11 h-11 rounded-xl bg-sky/15 flex items-center justify-center mb-4">
        <Icon size={20} className="text-sky" strokeWidth={1.75} />
      </div>
      <h3 className="text-navy font-bold text-lg mb-2">{title}</h3>
      <p className="text-text-muted text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function VehicleCard({
  icon: Icon,
  label,
  capacity,
}: {
  icon: LucideIcon;
  label: string;
  capacity: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
      <div className="w-14 h-14 rounded-xl bg-navy/10 mx-auto mb-4 flex items-center justify-center">
        <Icon size={26} className="text-navy" strokeWidth={1.75} />
      </div>
      <div className="text-navy font-bold text-base mb-1">{label}</div>
      <div className="text-text-muted text-xs">{capacity}</div>
    </div>
  );
}

function RequirementRow({ children }: { children: string }) {
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

function StepRow({
  step,
  title,
  body,
}: {
  step: number;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-5">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center font-extrabold text-sm">
        {step}
      </div>
      <div className="flex-1 pt-1">
        <h4 className="text-navy font-bold text-base mb-1">{title}</h4>
        <p className="text-text-muted text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

export default async function ForDriversPage() {
  const [hero, img] = await Promise.all([getPageBlock('hero_for_drivers'), getImageSlots()]);
  return (
    <>
      <PageHero
        heroImageUrl={hero?.coverImageUrl ?? null}
        eyebrow="Earn on Your Terms"
        title={
          <>
            Drive with SEIRS.
            <br />
            <span className="text-sky">Get paid daily.</span>
          </>
        }
        subtitle="Join Nigeria's smartest last-mile delivery network. Okada, keke, car, van: bring what you have. Daily wallet payouts, smart routing, real support."
        icon={Truck}
        primaryCtaLabel="Apply to drive"
        primaryCtaHref={STORE.play('driver')}
        secondaryCtaLabel="See how it works"
        secondaryCtaHref="/how-it-works"
      />

      {/* Why drive with us */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Why SEIRS</p>
            <h2 className="section-title mb-4">
              Built for drivers, not just dispatchers
            </h2>
            {/* Reworded 2026-08-15 (founder flagged it). "In Lagos" pinned
                the pitch to one city after the whole site moved to Nigeria
                framing for the Africa expansion. And "pays you what you
                earn" was circular: it said nothing, and read suspiciously
                it invited "so where is the cut?". The true, checkable
                strength is the opposite: the platform cut is shown plainly
                on every trip, so say that. */}
            <p className="section-sub">
              Built around how dispatch riders actually work in Nigeria: a
              platform that respects your time and shows you exactly what you
              earn on every trip.
            </p>
          </div>

          {/* Story rows: images and words alternate down the page rather
              than stacking in a block above the cards. */}
          <div className="space-y-16 mb-20">
            <StoryRow
              imageUrl={img.img_driver_earnings}
              alt="Rider checking his earnings"
              eyebrow="The money"
              title="Your money moves when you do"
              /* Rewritten 2026-08-29 (website audit). Four claims in one
                 sentence, three of them false against the payout engine:

                   "no minimum balance"          driver_min_payout_ngn is
                                                 1,000. There is a minimum.
                   "credits your wallet
                    immediately"                 earnings land as PENDING
                                                 until availableAt, and a
                                                 rider in their first
                                                 driver_new_period_days (30)
                                                 has driver_new_holdback_pct
                                                 (10%) held back on top.
                   "Withdraw whenever you want"  driver_daily_cap_ngn is
                                                 200,000, and 50,000 while
                                                 the rider is still new.

                 The Terms of Service said "processed within 3-5 business
                 days" on the same product at the same time, so the site
                 contradicted itself as well as the code. What is left below
                 is true today and stays true if an admin retunes the rows,
                 because it names no number the catalogue owns. */
              body="Every completed delivery is credited to your earnings the moment it clears, with the platform cut shown plainly beside it. No Friday batch, no calling anyone to ask where your money is. Withdraw to your bank when you want it, or let the daily payout run send it for you."
              points={[
                'Earnings visible per trip, with the platform cut shown plainly',
                // Restored 2026-08-15, same day it was weakened. The claim
                // was written down as false because the escrow release paid a
                // flat 70% of gross, ignoring the booking row where the night
                // fee was allocated to the driver in full. The release now
                // honours the booked driverEarnings, so the original promise
                // is true in code and can be true on the page.
                // The seeded card pays the rider 80% of the night surcharge
                // (timeSurcharges.night.driverSharePercent), not 100%. "In
                // full" was a recruitment promise the engine contradicts.
                'Night pickups carry a night fee, and most of it is yours',
                // "Instant withdrawal available once earnings are a day
                // old" was wrong in both directions: the clearance window
                // is an admin row (driver_clearance_business_days), the
                // code default is 2 business days, and production has it
                // at 0. A page cannot assert "a day" for a number the
                // founder retunes from a dashboard, so it now describes
                // the mechanism instead of guessing its setting.
                'A clearance window applies before a job can be withdrawn, shown on every trip in the app',
                'New riders have a small share held back for their first weeks, released automatically',
                'Minimum withdrawal and daily limits apply, both shown in the app before you request one',
              ]}
            />
            <StoryRow
              imageUrl={img.img_driver_kyc}
              alt="Driver verification documents"
              flip
              eyebrow="Getting started"
              title="Verified once, then you ride"
              body="Sign up with your licence, NIN and vehicle details. Our compliance team reviews your documents, and once you are approved the jobs start reaching you. You keep browsing the app while you wait, so nothing is a black box."
              points={[
                'Okada, keke, car, van, or truck: bring what you already ride',
                'Documents stay encrypted and are only opened for compliance review',
              ]}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* "Daily payouts" cut 2026-08-15: it restated the "Your money
                moves" story row above it almost verbatim. "Protected
                handoffs" cut the same day: proof photo, codes and escrow
                were being told three times on one page (this card, the
                person row below, the trust section). One telling each. */}
            <FeatureCard
              icon={Clock}
              title="Drive when you want"
              body="Go online when you're free, accept the jobs that fit, go offline when you're done. No shifts, no quotas, no penalty for taking a day off."
            />
            <FeatureCard
              icon={MapPin}
              title="Smart routing"
              body="Multi-stop matching groups nearby orders so you're paid for one trip but deliver multiple packages, your earnings per litre of fuel go up."
            />
            {/* "Top-driver rewards" removed 2026-08-15. It promised weekly
                bonus payouts based on completion rate (no such system exists
                anywhere in the backend; the weekly-goal reward program is a
                deferred founder decision, not a shipped feature) and free
                priority on premium jobs for 4.7+ ratings, while priority
                matching is actually the paid Driver Premium subscription.
                A recruitment page contradicting our own paid product is the
                same disease the SEIRS Standard died of. */}
            <FeatureCard
              icon={TrendingUp}
              title="Earnings dashboard"
              body="See today's earnings, this week, this month, broken down by trip count, distance, and fees. Every naira accounted for."
            />
          </div>
        </div>
      </section>

      {/* Vehicle types + earnings */}
      <section className="py-section-sm lg:py-section-lg bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Bring What You Have</p>
            <h2 className="section-title mb-4">All vehicle types welcome</h2>
            <p className="section-sub">
              We match jobs to vehicle capacity, so you only see deliveries you
              can actually complete.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <VehicleCard
              icon={Bike}
              label="Bicycle"
              capacity="Up to 5 kg"
            />
            <VehicleCard
              icon={Zap}
              label="Okada (motorcycle)"
              capacity="Up to 20 kg"
            />
            <VehicleCard
              icon={CarTaxiFront}
              label="Keke (tricycle)"
              capacity="Up to 100 kg"
            />
            <VehicleCard
              icon={Car}
              label="Car"
              capacity="Up to 200 kg"
            />
            <VehicleCard
              icon={Truck}
              label="Van / Truck"
              capacity="800 kg+"
            />
          </div>

          {/* The per-vehicle "typical take-home" ranges removed 2026-08-15:
              a network with zero completed trips has no typical anything,
              same class of invented statistic as the 10,000+ deliveries the
              homepage once claimed. Real ranges can return when real months
              of trips exist to average. */}
          <p className="text-text-muted text-xs text-center mt-6 max-w-2xl mx-auto">
            Fares are quoted per trip in the app before you accept, based on
            distance, vehicle type and demand.
          </p>
        </div>
      </section>

      {/* Requirements */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Requirements</p>
            <h2 className="section-title mb-4">What you need to start</h2>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <ul>
              <RequirementRow>
                Valid Nigerian ID (NIN, BVN, driver&apos;s licence, voter&apos;s card, or international passport)
              </RequirementRow>
              <RequirementRow>
                A working smartphone with GPS
              </RequirementRow>
              <RequirementRow>
                A vehicle you own or have permission to use (bicycle, motorcycle, tricycle, car, or van)
              </RequirementRow>
              <RequirementRow>
                Vehicle papers (registration certificate or proof of permission to use)
              </RequirementRow>
              <RequirementRow>
                Driver&apos;s licence (motorbike riders need rider&apos;s permit, car/van drivers need full licence)
              </RequirementRow>
              <RequirementRow>
                A Nigerian bank account in your name for your payouts
              </RequirementRow>
              <RequirementRow>
                Be at least 18 years old
              </RequirementRow>
            </ul>
          </div>
        </div>
      </section>

      {/* Founder 2026-08-15, revised same day: not a full-width band but a
          picture NEXT TO text, like the story rows above (the intended
          photo: a driver with a customer, or at a store counter). StoryRow
          gives exactly that: side by side 50/50 on desktop, stacked
          image-first on a phone, text-only with no hole when the slot is
          empty. The slot stays img_driver_portrait, admin-replaceable.
          Every point below was verified against the code earlier today:
          one-time handoff codes, the enforced proof photo, and escrow. */}
      <section className="py-section-sm lg:py-section-lg bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryRow
            imageUrl={img.img_driver_portrait}
            alt="A SEIRS rider handing a package to a customer"
            flip
            eyebrow="The work itself"
            title="Every delivery ends with a person"
            body="A customer at a gate, a shop owner at a counter. You confirm the code, take the photo, and you are done: the record is already on your side, and the money is already waiting."
            points={[
              'Handoffs confirm with a one-time code, so the right person gets the package',
              'Your proof photo closes every delivery, and the record stays yours in a dispute',
            ]}
          />
        </div>
      </section>

      {/* Application steps */}
      <section className="py-section-sm lg:py-section-lg bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Application Process</p>
            <h2 className="section-title mb-4">From signup to first trip</h2>
            {/* Was "Most drivers are approved and earning within 48 hours",
                corrected 2026-08-15. Two problems: our own identity policy
                puts manual document review at 24 hours to 3 business days,
                so 48 hours was a promise the review process does not make;
                and "most drivers" is a statistic about a driver population
                that does not exist yet. */}
            <p className="section-sub">
              Approval usually takes one to three business days once your
              documents are in.
            </p>
          </div>

          <div className="space-y-8">
            <StepRow
              step={1}
              title="Apply in the Driver app (5 min)"
              body="Download the SEIRS Driver app, create your account, fill in your basic info, upload your vehicle and ID photos."
            />
            <StepRow
              step={2}
              title="KYC verification (1 to 3 business days)"
              body="Our compliance team reviews your documents. We may call you for a short interview. You'll get an email + push notification when you're approved."
            />
            <StepRow
              step={3}
              title="Add your bank account"
              body="Link your Nigerian bank account in the app. Earnings flow there automatically. We never ask for your card details or password."
            />
            <StepRow
              step={4}
              title="Go online and earn"
              // "Get paid the same day every trip clears" was false three
              // ways, corrected 2026-08-15: earnings become withdrawable a
              // day after a trip clears (this page already said so further
              // up), payouts only run once the balance passes the minimum,
              // and new drivers carry a partial holdback for their first
              // month. Same-day was contradicted by our own copy.
              body="Tap 'Go Online' in the app. Jobs near you start appearing. Accept the ones you want, and earnings become withdrawable a day after each trip clears."
            />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Your Safety Matters</p>
            <h2 className="section-title mb-4">We have your back</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={ShieldCheck}
              title="In-app SOS"
              body="One tap alerts SEIRS ops with your live location and notifies your customer that something is wrong. The app also puts the 199 emergency line one tap away."
            />
            <FeatureCard
              icon={Banknote}
              title="No cash, no risk"
              body="All payments go through our escrow. You never carry cash from customers, never get cheated at handoff."
            />
            <FeatureCard
              icon={FileBadge}
              title="Transparent disputes"
              body="Disagreements with a customer? Our handoff records (GPS trail, OTP timestamps, photos) settle it fairly. You're not at the mercy of one bad rating."
            />
          </div>
        </div>
      </section>

      {/* subtitle was "Apply now and start earning on Nigeria's
          fastest-growing delivery network", removed 2026-08-15. A growth
          superlative needs growth to measure, and the network has not
          launched. It is also the exact class of claim a competitor can
          trivially disprove. */}
      <PageCta
        title="Ready to drive with SEIRS?"
        subtitle="Apply now, get your documents reviewed, and start taking jobs as soon as you are approved."
        primaryLabel="Apply to drive"
        primaryHref={STORE.play('driver')}
      />
    </>
  );
}
