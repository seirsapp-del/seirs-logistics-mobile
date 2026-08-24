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
import { getPageBlock } from "@/lib/cms";
import { AppScreenshot } from "@/components/AppScreenshot";
import { STORE, type ScreenKey } from "@/lib/launch";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From order creation to doorstep handoff, see exactly how SEIRS Logistics matches customers, drivers, and partner stores across Nigeria for fast, secure last-mile delivery.",
};

/**
 * One step of the customer story: a real app screen on one side, short copy on
 * the other, sides alternating down the page.
 *
 * Replaced the old StepCard 2026-08-14. That was a bordered card holding a
 * number, an outline icon and a ~95 word paragraph, and the page was nothing
 * but those top to bottom: no product imagery anywhere, which is the wall of
 * text a visitor arriving from social media bounces off. The screenshot now
 * carries what the paragraph used to describe, so the copy is a lead sentence
 * plus the two or three details that actually build trust.
 *
 * On a phone there is no room to alternate, so every step stacks screen-first:
 * the image is the hook, the words follow.
 */
function StoryStep({
  step,
  icon: Icon,
  title,
  lead,
  points,
  screen,
  screenAlt,
  flip = false,
}: {
  step: number;
  icon: LucideIcon;
  title: string;
  lead: string;
  points: string[];
  screen: ScreenKey;
  screenAlt: string;
  flip?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-16 items-center">
      <div className={flip ? 'lg:order-2' : ''}>
        <AppScreenshot screen={screen} alt={screenAlt} />
      </div>

      <div className={flip ? 'lg:order-1' : ''}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-navy text-white flex items-center justify-center font-extrabold text-sm flex-shrink-0">
            {step}
          </div>
          <Icon size={20} className="text-sky flex-shrink-0" strokeWidth={1.75} />
        </div>
        <h3 className="text-navy font-bold text-xl sm:text-2xl mb-3">{title}</h3>
        <p className="text-text-muted leading-relaxed mb-4">{lead}</p>
        <ul className="space-y-2">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-text-muted text-sm leading-relaxed">
              <span className="text-sky font-bold flex-shrink-0" aria-hidden>
                &bull;
              </span>
              {p}
            </li>
          ))}
        </ul>
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

export default async function HowItWorksPage() {
  const hero = await getPageBlock('hero_how_it_works');
  return (
    <>
      {/* primaryCtaHref was "/contact": the label promised an app and
          delivered a support form. Under the act-live pattern it goes to the
          store listing. PageHero renders a plain Link, so this is the Play
          URL rather than the platform-aware GetAppButton the homepage uses.
          Worth unifying when the remaining CTAs get retargeted. */}
      <PageHero
        heroImageUrl={hero?.coverImageUrl ?? null}
        eyebrow="Simple Process"
        title={
          <>
            Three apps. One{" "}
            <span className="text-sky">trusted</span> network.
          </>
        }
        subtitle="SEIRS runs on three connected apps, one for customers sending packages, one for drivers fulfilling them, and one for businesses and partner stores managing volume. They all talk to the same backend, in real time."
        icon={Workflow}
        primaryCtaLabel={
          <>
            <span className="sm:hidden">Get the App</span>
            <span className="hidden sm:inline">Get the Customer App</span>
          </>
        }
        primaryCtaHref={STORE.play('customer')}
        secondaryCtaLabel="Become a Driver"
        secondaryCtaHref={STORE.play('driver')}
      />

      {/* The 3-step flow */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">The Customer Flow</p>
            <h2 className="section-title mb-4">From order to doorstep</h2>
            <p className="section-sub">
              The whole journey takes under five taps in the customer app.
            </p>
          </div>

          <div className="space-y-10 lg:space-y-24">
            <StoryStep
              step={1}
              icon={Smartphone}
              title="Create the order"
              lead="Drop your pickup and dropoff pins, pick a vehicle that fits the load, and see the price before you commit."
              points={[
                "Send a package or request a ride, from the same screen.",
                "Auto-quoted from zone pricing and a fuel index, not a guess.",
                "The price you see is the price you pay. No surcharges at the end.",
              ]}
              screen="customerBooking"
              screenAlt="Booking a delivery in the SEIRS customer app"
            />
            <StoryStep
              step={2}
              icon={Truck}
              title="A verified driver accepts"
              lead="The job goes to nearby online drivers, ranked by rating, vehicle fit and route. You meet yours the moment they accept."
              points={[
                "Every driver is identity-verified and KYC-reviewed before going online.",
                "Licence and vehicle papers checked, not just uploaded.",
                "You see their photo, name, plate number and live location.",
              ]}
              screen="customerDriverAccepted"
              screenAlt="A matched driver's profile in the SEIRS customer app"
              flip
            />
            <StoryStep
              step={3}
              icon={CheckCircle}
              title="Tracked live, all the way to the door"
              lead="Watch it move on the map in real time, and control the handoff at both ends."
              points={[
                "Pickup and drop-off are confirmed with a one-time code from your app.",
                "That code is why a package cannot be released to the wrong person.",
                "Escrow releases to the driver only after you confirm delivery.",
              ]}
              screen="customerTracking"
              screenAlt="Live delivery tracking in the SEIRS customer app"
            />
          </div>
        </div>
      </section>

      {/* The trust layer */}
      <section className="py-section-sm lg:py-section-lg bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Built on Trust</p>
            <h2 className="section-title mb-4">
              Every handoff is verified
            </h2>
            <p className="section-sub">
              We took the four most common Nigerian delivery failures
              (wrong recipient, lost package, fraud, missed payment)
              and engineered them out of the flow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 max-w-4xl mx-auto">
            <FeatureBlock
              icon={ShieldCheck}
              title="Identity-verified drivers"
              body="Every driver clears NIN-anchored KYC plus vehicle document review before their first trip."
            />
            <FeatureBlock
              icon={KeyRound}
              title="Two-method handoff"
              body="The recipient verifies with either a physical ID + email OTP, or their personal SEIRS ID and a typed signature. No code, no package release."
            />
            <FeatureBlock
              icon={Lock}
              title="Escrow on every payment"
              body="Payments are held in escrow until you confirm delivery. If a delivery fails, the money returns to your original payment method."
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
              body="If a driver goes offline mid-trip without warning, the delivery is reassigned to a nearby driver: your package keeps moving."
            />
          </div>
        </div>
      </section>

      {/* The 3-app system */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Reframed 2026-08-14. This was three text cards, one of them the
              customer app, which the story above now shows three times over.
              Repeating it here in a smaller, wordier form added nothing. The
              section is the other side of the network, and it is where the
              two driver captures we already have finally get used. */}
          <div className="text-center mb-14">
            <p className="section-label mb-3">The Other Side of the Network</p>
            <h2 className="section-title mb-4">
              The apps that fulfil your delivery
            </h2>
            <p className="section-sub">
              Every order you place lands in one of these. Same backend, same
              live data, built for the people moving your package.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 max-w-3xl mx-auto">
            <div className="text-center">
              <AppScreenshot
                screen="driverHome"
                alt="The SEIRS driver app home screen"
                className="mb-6"
              />
              <div className="flex items-center justify-center gap-2.5 mb-2">
                <Truck size={20} className="text-sky" strokeWidth={1.75} />
                <h3 className="text-navy font-bold text-lg">Driver App</h3>
              </div>
              <p className="text-text-muted text-sm leading-relaxed">
                {/* "Onboarding takes about ten minutes" removed 2026-08-23.
                    It sat oddly beside /for-drivers, which correctly says
                    approval takes one to three business days, so the two
                    pages together read as a ten-minute sign-up. Filling the
                    form is not the wait; document review is. */}
                Go online, accept jobs, navigate to pickup, complete handoffs,
                and watch earnings land.
              </p>
            </div>

            <div className="text-center">
              <AppScreenshot
                screen="driverEarnings"
                alt="The SEIRS driver earnings screen"
                className="mb-6"
              />
              <div className="flex items-center justify-center gap-2.5 mb-2">
                <Workflow size={20} className="text-success-green" strokeWidth={1.75} />
                <h3 className="text-navy font-bold text-lg">Business App</h3>
              </div>
              <p className="text-text-muted text-sm leading-relaxed">
                Bulk dispatch, CSV upload, multi-stop routing, team access and
                partner-store dashboards. Sender or Partner Store accounts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* "place your first delivery in under two minutes" dropped
          2026-08-15. It is a speed claim nobody has timed, and it invites
          the reader to treat two minutes as a standard the app has to meet
          on their connection, on their first try, while entering an address
          they have never entered before. */}
      <PageCta
        title="Ready to try it?"
        subtitle="Download the SEIRS Customer app and send your first package."
        primaryLabel="Get the Customer App"
        primaryHref={STORE.play('customer')}
      />
    </>
  );
}
