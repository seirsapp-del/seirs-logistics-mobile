import type { Metadata } from "next";
import {
  Truck,
  Wallet,
  Clock,
  Award,
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

export const metadata: Metadata = {
  title: "For Drivers",
  description:
    "Drive with Seirs and earn on your terms. Daily wallet payouts, smart routing, verified senders, insured trips. Join Nigeria's smartest last-mile delivery network.",
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
  earningsHint,
}: {
  icon: LucideIcon;
  label: string;
  capacity: string;
  earningsHint: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
      <div className="w-14 h-14 rounded-xl bg-navy/10 mx-auto mb-4 flex items-center justify-center">
        <Icon size={26} className="text-navy" strokeWidth={1.75} />
      </div>
      <div className="text-navy font-bold text-base mb-1">{label}</div>
      <div className="text-text-muted text-xs mb-3">{capacity}</div>
      <div className="text-success-green font-semibold text-sm">
        {earningsHint}
      </div>
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

export default function ForDriversPage() {
  return (
    <>
      <PageHero
        eyebrow="Earn on Your Terms"
        title={
          <>
            Drive with Seirs.
            <br />
            <span className="text-sky">Get paid daily.</span>
          </>
        }
        subtitle="Join Nigeria's smartest last-mile delivery network. Bicycle, motorbike, tricycle, car, van — bring what you have. Daily wallet payouts, smart routing, verified senders, real support."
        icon={Truck}
        primaryCtaLabel="Apply to drive"
        primaryCtaHref="/contact"
        secondaryCtaLabel="See how it works"
        secondaryCtaHref="/how-it-works"
      />

      {/* Why drive with us */}
      <section className="py-20 bg-off-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Why Seirs</p>
            <h2 className="section-title mb-4">
              Built for drivers, not just dispatchers
            </h2>
            <p className="section-sub">
              We talked to over 100 Lagos and Abuja dispatch riders before
              writing a single line of the driver app. The result: a platform
              that respects your time and pays you what you earn.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Wallet}
              title="Daily payouts"
              body="Earnings credit your Seirs wallet after every completed trip. Withdraw to your bank account any time — no waiting until end of week, no minimum balance."
            />
            <FeatureCard
              icon={Clock}
              title="Drive when you want"
              body="Go online when you're free, accept the jobs that fit, go offline when you're done. No shifts, no quotas, no penalty for taking a day off."
            />
            <FeatureCard
              icon={MapPin}
              title="Smart routing"
              body="Multi-stop matching groups nearby orders so you're paid for one trip but deliver multiple packages — your earnings per litre of fuel go up."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Verified senders, insured trips"
              body="Every customer is identity-verified before they can book. Every trip is covered by our platform insurance — you're never out of pocket if something goes wrong."
            />
            <FeatureCard
              icon={Award}
              title="Top-driver rewards"
              body="Drivers with 4.7+ rating get priority on premium jobs (high-value packages, scheduled deliveries) and weekly bonus payouts based on completion rate."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Earnings dashboard"
              body="See today's earnings, this week, this month — broken down by trip count, distance, and bonuses. Forecast tomorrow based on your usual hours."
            />
          </div>
        </div>
      </section>

      {/* Vehicle types + earnings */}
      <section className="py-20 bg-white">
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
              earningsHint="₦500 — ₦1,500 / trip"
            />
            <VehicleCard
              icon={Bike}
              label="Motorcycle"
              capacity="Up to 20 kg"
              earningsHint="₦800 — ₦3,000 / trip"
            />
            <VehicleCard
              icon={Bike}
              label="Tricycle"
              capacity="Up to 100 kg"
              earningsHint="₦1,500 — ₦5,000 / trip"
            />
            <VehicleCard
              icon={Car}
              label="Car"
              capacity="Up to 200 kg"
              earningsHint="₦2,000 — ₦8,000 / trip"
            />
            <VehicleCard
              icon={Truck}
              label="Van / Truck"
              capacity="800 kg+"
              earningsHint="₦4,000 — ₦25,000 / trip"
            />
          </div>

          <p className="text-text-muted text-xs text-center mt-6 max-w-2xl mx-auto">
            Earnings ranges shown are typical per-trip take-home after platform
            fee. Actual earnings depend on distance, demand, vehicle type, and
            your tier.
          </p>
        </div>
      </section>

      {/* Requirements */}
      <section className="py-20 bg-off-white">
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
                A working Android smartphone with GPS
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
                A Nigerian bank account in your name for weekly payouts
              </RequirementRow>
              <RequirementRow>
                Be at least 18 years old
              </RequirementRow>
            </ul>
          </div>
        </div>
      </section>

      {/* Application steps */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Application Process</p>
            <h2 className="section-title mb-4">From signup to first trip</h2>
            <p className="section-sub">
              Most drivers are approved and earning within 48 hours.
            </p>
          </div>

          <div className="space-y-8">
            <StepRow
              step={1}
              title="Apply in the Driver app (5 min)"
              body="Download the Seirs Driver app, create your account, fill in your basic info, upload your vehicle and ID photos."
            />
            <StepRow
              step={2}
              title="KYC verification (24 — 48 hrs)"
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
              body="Tap 'Go Online' in the app. Jobs near you start appearing. Accept the ones you want. Get paid the same day every trip clears."
            />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="py-20 bg-off-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Your Safety Matters</p>
            <h2 className="section-title mb-4">We have your back</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeatureCard
              icon={ShieldCheck}
              title="In-app SOS"
              body="One tap alerts our 24/7 safety team with your live location. Emergency services contacted on your behalf if needed."
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
            <FeatureCard
              icon={Truck}
              title="Vehicle-aware matching"
              body="No one will send you a 50 kg load on a bicycle. Our matching engine respects your vehicle's capacity."
            />
          </div>
        </div>
      </section>

      <PageCta
        title="Ready to drive with Seirs?"
        subtitle="Apply now and start earning on Nigeria's fastest-growing delivery network."
        primaryLabel="Apply to drive"
        primaryHref="/contact"
      />
    </>
  );
}
