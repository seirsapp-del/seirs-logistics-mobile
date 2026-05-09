import type { Metadata } from "next";
import {
  Briefcase,
  Upload,
  Wallet,
  Users,
  Route,
  FileSpreadsheet,
  Clock,
  TrendingUp,
  Building2,
  Receipt,
  Repeat,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { PageHero, PageCta } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "For Business",
  description:
    "Send hundreds of packages with one click. Seirs Business gives Nigerian companies a single dashboard for bulk dispatch, multi-stop routing, business wallets, team access, and itemised receipts.",
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

export default function ForBusinessPage() {
  return (
    <>
      <PageHero
        eyebrow="Built for Volume"
        title={
          <>
            Send thousands of packages
            <br />
            <span className="text-sky">with one click.</span>
          </>
        }
        subtitle="Seirs Business is for traders, e-commerce shops, restaurants, and SMEs who dispatch dozens to hundreds of packages a day. Bulk send, multi-stop routes, business wallet, team access — all from one dashboard."
        icon={Briefcase}
        primaryCtaLabel="Talk to our team"
        primaryCtaHref="/contact"
        secondaryCtaLabel="Become a partner store"
        secondaryCtaHref="/for-partner-stores"
      />

      {/* Use cases bar */}
      <section className="py-12 bg-white border-b border-gray-100">
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
      <section className="py-20 bg-off-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="section-label mb-3">What You Get</p>
            <h2 className="section-title mb-4">
              Everything you need to dispatch at scale
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Upload}
              title="CSV bulk upload"
              body="Drag in a CSV with recipient names, addresses, and notes — we generate every individual delivery, validate Nigerian phone formats, and dispatch in one batch."
            />
            <FeatureCard
              icon={Route}
              title="Multi-stop routing"
              body="Group nearby drops into a single route. Our optimiser sequences stops to minimise distance and time. One driver, multiple drops, one fare."
            />
            <FeatureCard
              icon={Wallet}
              title="Business wallet"
              body="Fund once via card, bank transfer, or USSD. Every delivery debits the wallet — no card-on-file friction, no awkward payment delays at peak hours."
            />
            <FeatureCard
              icon={Users}
              title="Team access"
              body="Add Managers and Dispatchers to your account with separate permissions. See who created which order. Audit trail for every action."
            />
            <FeatureCard
              icon={Receipt}
              title="Itemised receipts"
              body="Every delivery generates a tax-aware receipt with breakdown of base fare, distance, surcharge, and platform fee. Export weekly or monthly for your books."
            />
            <FeatureCard
              icon={Repeat}
              title="Recurring orders"
              body="Schedule the same delivery to repeat daily, weekly, or on selected days — for office supplies, bakery deliveries, or pharmacy refills."
            />
            <FeatureCard
              icon={Clock}
              title="Same-day & scheduled"
              body="Dispatch instantly or pre-book up to 7 days ahead. Pre-booked orders go to the matching engine 30 minutes before pickup time."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Loyalty discounts"
              body="Volume tiers automatically unlock 5% — 15% off platform fees as your monthly delivery count grows. Top tier: dedicated account manager."
            />
            <FeatureCard
              icon={Building2}
              title="Multiple branches"
              body="One business account, multiple pickup addresses — branch in Ikeja, branch in Lekki, warehouse in Apapa. Each can dispatch independently."
            />
          </div>
        </div>
      </section>

      {/* Two account types */}
      <section className="py-20 bg-white">
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
                <CheckRow>Business wallet with team access</CheckRow>
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
                For neighbourhood shops who run a Seirs drop-off / pickup point.
              </p>
              <ul className="space-y-3">
                <CheckRow>Earn ₦500 per package collected</CheckRow>
                <CheckRow>Capacity dashboard — accept what you have room for</CheckRow>
                <CheckRow>QR scan-in / scan-out for every package</CheckRow>
                <CheckRow>Weekly automatic payout to your bank</CheckRow>
                <CheckRow>Foot traffic boost — customers come to your shop</CheckRow>
                <CheckRow>Pause acceptance during stock days or closures</CheckRow>
              </ul>
              <p className="text-text-muted text-xs mt-5">
                <a
                  href="/for-partner-stores"
                  className="text-sky font-semibold hover:underline"
                >
                  Read more about Partner Stores →
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tools mini list */}
      <section className="py-20 bg-off-white">
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

      <PageCta
        title="Ready to scale your delivery operations?"
        subtitle="Get a free walkthrough with our team. We'll set up your account, import your address book, and run a test batch with you."
        primaryLabel="Book a demo"
        primaryHref="/contact"
      />
    </>
  );
}
