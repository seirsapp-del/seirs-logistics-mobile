import type { Metadata } from "next";
import {
  Workflow,
  Smartphone,
  Truck,
  CheckCircle,
  ShieldCheck,
  MapPin,
  Lock,
  KeyRound,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { PageHero, PageCta } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From order creation to doorstep handoff — see exactly how Seirs Logistics matches customers, drivers, and partner stores across Nigeria for fast, secure last-mile delivery.",
};

function StepCard({
  step,
  icon: Icon,
  title,
  body,
}: {
  step: number;
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
      <div className="flex items-start gap-5">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-xl bg-navy text-white flex items-center justify-center font-extrabold text-lg">
            {step}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <Icon size={22} className="text-sky" strokeWidth={1.75} />
            <h3 className="text-navy font-bold text-xl">{title}</h3>
          </div>
          <p className="text-text-muted leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );
}

function FeatureBlock({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-sky/10 flex items-center justify-center">
        <Icon size={20} className="text-sky" strokeWidth={1.75} />
      </div>
      <div>
        <h4 className="text-navy font-bold text-base mb-1.5">{title}</h4>
        <p className="text-text-muted text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="Simple Process"
        title={
          <>
            Three apps. One{" "}
            <span className="text-sky">trusted</span> network.
          </>
        }
        subtitle="Seirs runs on three connected apps — one for customers sending packages, one for drivers fulfilling them, and one for businesses and partner stores managing volume. They all talk to the same backend, in real time."
        icon={Workflow}
        primaryCtaLabel="Get the Customer App"
        primaryCtaHref="/contact"
        secondaryCtaLabel="Become a Driver"
        secondaryCtaHref="/for-drivers"
      />

      {/* The 3-step flow */}
      <section className="py-20 bg-off-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">The Customer Flow</p>
            <h2 className="section-title mb-4">From order to doorstep</h2>
            <p className="section-sub">
              The whole journey takes under five taps in the customer app.
            </p>
          </div>

          <div className="space-y-5">
            <StepCard
              step={1}
              icon={Smartphone}
              title="Create the order"
              body="Open the Seirs Customer app, choose Send a Package or Request a Ride, drop your pickup and dropoff pins, pick a vehicle that fits your load. We auto-quote a fair price using our pooled-driver matching, fuel index, and zone-based pricing — no surprise surcharges at the end."
            />
            <StepCard
              step={2}
              icon={Truck}
              title="A verified driver accepts"
              body="Our matching engine sends the job to nearby online drivers ranked by rating, vehicle fit, and route efficiency. Every driver on the network is identity-verified, has uploaded a valid driver's license and vehicle papers, and has passed our KYC review. You see their photo, name, plate number, and live location the moment they accept."
            />
            <StepCard
              step={3}
              icon={CheckCircle}
              title="Pickup, transit, drop-off — all tracked live"
              body="Watch your package move on the map in real time. The driver verifies pickup and drop-off using a one-time code generated in your app, so packages can't be released to the wrong person. Funds in escrow release to the driver only after you confirm delivery."
            />
          </div>
        </div>
      </section>

      {/* The trust layer */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Built on Trust</p>
            <h2 className="section-title mb-4">
              Every handoff is verified
            </h2>
            <p className="section-sub">
              We took the four most common Nigerian delivery failures
              — wrong recipient, lost package, fraud, missed payment —
              and engineered them out of the flow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 max-w-4xl mx-auto">
            <FeatureBlock
              icon={ShieldCheck}
              title="Identity-verified drivers"
              body="Every driver clears NIN-anchored KYC plus vehicle document review before their first trip. Their SEIRS ID is bound to their phone biometrics."
            />
            <FeatureBlock
              icon={KeyRound}
              title="Two-method handoff"
              body="The recipient verifies with either a physical ID + email OTP, or their personal SEIRS ID and a typed signature. No code, no package release."
            />
            <FeatureBlock
              icon={Lock}
              title="Escrow on every payment"
              body="Card and wallet payments are held in escrow until delivery is confirmed. Failed deliveries refund automatically within 3 business days."
            />
            <FeatureBlock
              icon={MapPin}
              title="Live location, audit trail"
              body="GPS pings every five seconds during a trip, all stored as an immutable handoff record. If anything goes wrong, our support team has the full chain of custody."
            />
            <FeatureBlock
              icon={Receipt}
              title="Tamper-proof receipts"
              body="Every completed trip generates a digital receipt with driver, vehicle, route, time, fare breakdown, and verification signatures. Forwardable for business expense reports."
            />
            <FeatureBlock
              icon={Truck}
              title="Backup driver auto-assignment"
              body="If a driver goes offline mid-trip without warning, our scheduler reassigns the active leg to a nearby driver within 90 seconds — your package keeps moving."
            />
          </div>
        </div>
      </section>

      {/* The 3-app system */}
      <section className="py-20 bg-off-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Three Apps, One Network</p>
            <h2 className="section-title mb-4">
              Each role gets a tailored experience
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-navy/10 flex items-center justify-center mb-5">
                <Smartphone size={22} className="text-navy" strokeWidth={1.75} />
              </div>
              <h3 className="text-navy font-bold text-lg mb-2">Customer App</h3>
              <p className="text-text-muted text-sm leading-relaxed mb-4">
                Send packages, request rides, track deliveries, manage payment
                methods, earn referral rewards.
              </p>
              <p className="text-text-muted text-xs">
                Available for Android — iOS coming soon.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-sky/15 flex items-center justify-center mb-5">
                <Truck size={22} className="text-sky" strokeWidth={1.75} />
              </div>
              <h3 className="text-navy font-bold text-lg mb-2">Driver App</h3>
              <p className="text-text-muted text-sm leading-relaxed mb-4">
                Go online, accept jobs, navigate to pickup, complete handoffs,
                track earnings, withdraw to your bank.
              </p>
              <p className="text-text-muted text-xs">
                Driver onboarding takes ~10 minutes.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-success-green/15 flex items-center justify-center mb-5">
                <Workflow size={22} className="text-success-green" strokeWidth={1.75} />
              </div>
              <h3 className="text-navy font-bold text-lg mb-2">Business App</h3>
              <p className="text-text-muted text-sm leading-relaxed mb-4">
                Bulk dispatch, CSV upload, business wallet, multi-stop routing,
                team access, partner-store dashboards.
              </p>
              <p className="text-text-muted text-xs">
                Two account types: Sender or Partner Store.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PageCta
        title="Ready to try it?"
        subtitle="Download the Seirs Customer app and place your first delivery in under two minutes."
        primaryLabel="Get Started"
        primaryHref="/contact"
      />
    </>
  );
}
