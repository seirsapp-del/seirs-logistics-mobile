import type { Metadata } from "next";
import {
  Briefcase,
  Upload,
  CreditCard,
  FileSpreadsheet,
  Clock,
  TrendingUp,
  Building2,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { PageHero, PageCta } from "@/components/PageHero";
import { getPageBlock, getImageSlots } from "@/lib/cms";
import { StoryRow } from "@/components/StoryRow";
import Link from "next/link";

// ISR: refetch the CMS-editable hero image every 60s so marketing
// changes appear within a minute without a redeploy.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "For Business",
  description:
    "Send hundreds of packages with one click. SEIRS Business gives Nigerian companies a single dashboard for bulk dispatch, multi-stop routing, team access, and itemised receipts.",
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

function CheckRow({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-3">
      <CheckCircle
        size={18}
        className="text-success-green flex-shrink-0 mt-0.5"
        strokeWidth={2}
      />
      <span className="text-text-muted text-sm leading-relaxed">{children}</span>
    </li>
  );
}

export default async function ForBusinessPage() {
  const [hero, img] = await Promise.all([getPageBlock('hero_for_business'), getImageSlots()]);
  return (
    <>
      <PageHero
        heroImageUrl={hero?.coverImageUrl ?? null}
        eyebrow="Built for Volume"
        title={
          <>
            Send thousands of packages
            <br />
            <span className="text-sky">with one click.</span>
          </>
        }
        subtitle="SEIRS Business is for traders, e-commerce shops, restaurants, and SMEs who dispatch dozens to hundreds of packages a day. Bulk send, multi-stop routes, team access, all from one dashboard."
        icon={Briefcase}
        primaryCtaLabel="Talk to our team"
        primaryCtaHref="/contact?subject=business"
        secondaryCtaLabel={
          <>
            <span className="sm:hidden">Partner stores</span>
            <span className="hidden sm:inline">Become a partner store</span>
          </>
        }
        secondaryCtaHref="/for-partner-stores"
      />

      {/* Use cases bar */}
      <section className="py-section-sm lg:py-section-lg bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-text-muted text-sm mb-6">
            Built for Nigerian businesses across categories
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            {[
              "E-commerce shops",
              "Restaurants & cafes",
              "Pharmacies",
              "Importers & traders",
              "Bakeries",
              "Fashion brands",
              "Office supplies",
              "Wholesale distributors",
            ].map((use) => (
              <div
                key={use}
                className="bg-off-white rounded-lg px-3 py-2.5 text-navy text-sm font-medium"
              >
                {use}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core features grid */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">What You Get</p>
            <h2 className="section-title mb-4">
              Everything you need to dispatch at scale
            </h2>
          </div>

          {/* Story rows: the morning dispatch, then the team around it. */}
          <div className="space-y-16 mb-20">
            <StoryRow
              imageUrl={img.img_business_csv}
              alt="Preparing the morning's orders"
              eyebrow="The morning rush"
              title="One upload instead of one hundred bookings"
              body="Most shops start the day the same way: a list of orders on paper or WhatsApp, and someone spending an hour arranging riders. Drop that list in as a spreadsheet and every delivery is created, priced, and dispatched together."
              points={[
                'Nigerian phone formats and addresses validated before dispatch',
                'Recurring routes saved once and rebooked in two taps',
                'Multi-stop runs sequenced automatically to save fuel and time',
              ]}
            />
            <StoryRow
              imageUrl={img.img_business_team}
              alt="Team reviewing orders together"
              flip
              eyebrow="Your team"
              title="Everyone dispatches, nobody guesses"
              body="Add your manager and dispatchers with their own logins and permissions. Every booking is attributed to whoever made it and paid for at the moment it is made, and the whole month lands in one itemised statement."
              points={[
                'Roles from owner to viewer, with spending visibility per person',
                'Every action carries an audit trail for your records',
                'Every receipt itemised line by line, ready for your books',
              ]}
            />
          </div>

          {/* Read-through 2026-08-15: five of nine cards (CSV upload,
              multi-stop routing, team access, itemised receipts, recurring
              orders) restated the two story rows directly above them, some
              near-verbatim. Cut; the four that remain each say something the
              rows do not. Also fixed in the survivors: "any hour" scheduling
              contradicted the 5 AM to 9 PM pickup window; the 15-minutes-
              before-pickup engine detail was a mechanism leak; the USSD
              funding channel and points-off-future-bookings redemption were
              claims nothing in the code verifies. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Was "Business wallet: fund once, dispatch all day. Every
                delivery debits the wallet". Replaced 2026-08-24 (sweep W-8).
                The symptom: this card sold a prepaid sender balance, which is
                deposit-taking, which SEIRS is not licensed to do and the Terms
                no longer describe. Every booking is paid at the time it is
                made through Flutterwave. Do not bring a top-up card back. */}
            <FeatureCard
              icon={CreditCard}
              title="Pay per booking"
              body="No float parked with us and nothing to reconcile at month end. Each dispatch is paid when it is booked, through Flutterwave, and lands on one itemised statement."
            />
            <FeatureCard
              icon={Clock}
              title="Same-day & scheduled"
              body="Send Now dispatches around the clock. Scheduled pickups book up to 7 days ahead, within daily pickup hours of 5 AM to 9 PM."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Loyalty points"
              body="Every delivery earns points, and your tier raises the rate you earn at. The more you ship, the faster they build."
            />
            <FeatureCard
              icon={Building2}
              title="Multiple branches"
              body="One business account, multiple pickup addresses, branch in Ikeja, branch in Lekki, warehouse in Apapa. Each can dispatch independently."
            />
          </div>
        </div>
      </section>

      {/* Two account types */}
      <section className="py-section-sm lg:py-section-lg bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">Two Account Types</p>
            <h2 className="section-title mb-4">Pick the one that fits</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-off-white rounded-2xl border border-gray-200 p-8">
              <div className="w-12 h-12 rounded-xl bg-navy text-white flex items-center justify-center mb-5">
                <Briefcase size={22} strokeWidth={1.75} />
              </div>
              <h3 className="text-navy font-bold text-2xl mb-2">Business Sender</h3>
              <p className="text-text-muted text-sm mb-6">
                For shops, brands, and offices dispatching deliveries to
                customers.
              </p>
              <ul className="space-y-3">
                <CheckRow>Bulk dispatch + CSV upload</CheckRow>
                <CheckRow>Multi-stop route optimisation</CheckRow>
                <CheckRow>Team logins with roles and spend visibility</CheckRow>
                <CheckRow>Recurring deliveries + scheduling</CheckRow>
                <CheckRow>Branded delivery notifications to recipients</CheckRow>
                <CheckRow>API access for shop integrations (Shopify, custom)</CheckRow>
              </ul>
            </div>

            <div className="bg-off-white rounded-2xl border border-gray-200 p-8">
              <div className="w-12 h-12 rounded-xl bg-sky text-white flex items-center justify-center mb-5">
                <Building2 size={22} strokeWidth={1.75} />
              </div>
              <h3 className="text-navy font-bold text-2xl mb-2">Partner Store</h3>
              <p className="text-text-muted text-sm mb-6">
                For neighbourhood shops who run a SEIRS drop-off / pickup point.
              </p>
              <ul className="space-y-3">
                <CheckRow>Earn a per-package fee on every handoff</CheckRow>
                <CheckRow>Capacity dashboard, accept what you have room for</CheckRow>
                <CheckRow>QR scan-in / scan-out for every package</CheckRow>
                <CheckRow>Weekly automatic payout to your bank</CheckRow>
                <CheckRow>Foot traffic boost, customers come to your shop</CheckRow>
                <CheckRow>Pause acceptance during stock days or closures</CheckRow>
              </ul>
              <p className="text-text-muted text-xs mt-5">
                {/* Was a raw <a>, which forced a full document reload on an
                    internal route. <Link> keeps it a client transition. */}
                <Link
                  href="/for-partner-stores"
                  className="text-sky font-semibold hover:underline"
                >
                  Read more about Partner Stores →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tools mini list */}
      <section className="py-section-sm lg:py-section-lg bg-off-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="section-label mb-3">Plays Nicely With Your Stack</p>
            <h2 className="section-title mb-4">Integrations that save time</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeatureCard
              icon={FileSpreadsheet}
              title="Spreadsheet workflows"
              body="Export delivery history as CSV. Import customer addresses from your existing CRM. Compatible with Google Sheets and Excel."
            />
            <FeatureCard
              icon={Upload}
              title="API for custom shops"
              body="REST API to programmatically create deliveries from your e-commerce backend. Webhooks for status updates. Fits Shopify, WooCommerce, custom Node/Python stacks."
            />
          </div>
        </div>
      </section>

      {/* Founder 2026-08-15: the person-photo-beside-text row each
          audience page carries. img_business_owner is admin-replaceable and
          already holds the businesswoman-packing-orders shot. No bullets on
          purpose: every candidate bullet restated a section above. */}
      <section className="py-section-sm lg:py-section-lg bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryRow
            imageUrl={img.img_business_owner}
            alt="A Nigerian business owner preparing orders for dispatch"
            flip
            eyebrow="Who this is for"
            title="Built for the owner who does everything"
            body="You take the orders, pack the parcels, answer the WhatsApp messages, and chase the riders. SEIRS takes the last one off your plate: dispatch becomes a list you upload, not a morning you lose."
          />
        </div>
      </section>

      <PageCta
        title="Ready to scale your delivery operations?"
        subtitle="Get a free walkthrough with our team. We'll set up your account, import your address book, and run a test batch with you."
        primaryLabel="Book a demo"
        primaryHref="/contact?subject=business"
      />
    </>
  );
}
