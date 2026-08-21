import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Seirs Logistics Ltd terms of service, the rules and conditions governing use of the Seirs platform for customers, businesses, drivers, and partner stores.",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="mb-8">
      <h2 className="text-xl font-bold text-navy mb-4 pb-2 border-b border-gray-100">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ml-0 mt-4">
      <h3 className="text-base font-bold text-[#374151] mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BodyText({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-[#374151] leading-relaxed">{children}</p>;
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-0">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-[15px] text-[#374151] leading-relaxed">
          <span className="mt-2 w-1.5 h-1.5 bg-sky rounded-full flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TermsOfServicePage() {
  const tocItems = [
    "About Seirs",
    "Eligibility",
    "Account Types",
    "Prohibited Items",
    "Pricing and Fees",
    "Payments and Refunds",
    "Delivery Terms",
    "Acceptable Use",
    "Suspension and Termination",
    "Intellectual Property",
    "Privacy",
    "Disclaimer of Warranties",
    "Limitation of Liability",
    "Governing Law and Disputes",
    "Changes to Terms",
    "Contact",
  ];

  return (
    <div className="bg-off-white min-h-screen">
      {/* Page header */}
      <div className="bg-navy py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-sky/20 rounded-xl flex items-center justify-center">
              <FileText size={20} className="text-sky" />
            </div>
            <div className="text-sky text-sm font-semibold tracking-wider uppercase">
              Legal Document
            </div>
          </div>
          <h1 className="text-title-sm lg:text-title-lg font-extrabold text-white mb-3">
            Terms of Service
          </h1>
          <p className="text-white/55 text-sm">
            Last updated: 30 April 2026 &nbsp;&bull;&nbsp; Effective: 30 April 2026
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sticky Table of Contents */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 bg-white rounded-card shadow-sm border border-gray-100 p-5">
              <h3 className="text-navy font-bold text-sm mb-3 uppercase tracking-wider">
                Contents
              </h3>
              <nav className="space-y-1">
                {tocItems.map((item, i) => (
                  <a
                    key={item}
                    href={`#section-${i + 1}`}
                    className="block text-text-muted hover:text-navy text-xs py-1 transition-colors"
                  >
                    {i + 1}. {item}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="lg:col-span-3">
            {/* Agreement box */}
            <div className="bg-blue-50 border-l-4 border-sky rounded-r-card p-5 mb-8">
              <BodyText>
                By creating an account or using Seirs services, you agree to these Terms. Please
                read them carefully. If you do not agree, do not use our platform.
              </BodyText>
            </div>

            <Section id="section-1" title="1. About Seirs">
              <BodyText>
                Seirs Logistics Ltd (&quot;Seirs&quot;, &quot;we&quot;, &quot;us&quot;) is a Nigerian technology company
                operating a last-mile delivery platform. We connect business senders with
                verified delivery drivers and partner pickup stores. We are a technology
                intermediary, we do not own delivery vehicles or operate physical stores.
              </BodyText>
            </Section>

            <Section id="section-2" title="2. Eligibility">
              <BulletList
                items={[
                  <>You must be at least <strong>18 years of age</strong> to create an account</>,
                  "You must provide accurate, complete, and current information at registration",
                  "You must have the legal capacity to enter into a binding contract under Nigerian law",
                  "One person may not maintain multiple active accounts of the same type",
                ]}
              />
            </Section>

            <Section id="section-3" title="3. Account Types">
              <SubSection title="3.1 Customer Accounts">
                <BodyText>
                  Individual users sending parcels. You are responsible for accurate pickup and
                  delivery information, correct package descriptions, and ensuring packages do
                  not contain prohibited items.
                </BodyText>
              </SubSection>
              <SubSection title="3.2 Business Sender Accounts">
                <BodyText>
                  Companies or sole traders sending parcels in bulk. Subject to additional KYC
                  verification. Business wallet funds are non-refundable except as stated in
                  Section 6.
                </BodyText>
              </SubSection>
              <SubSection title="3.3 Driver Accounts">
                <BodyText>
                  Independent contractors, not employees of Seirs. Drivers must hold valid
                  Nigerian driving licenses, maintain valid vehicle insurance, and comply with
                  all applicable traffic laws. Drivers are solely responsible for safe vehicle
                  operation and personal income tax obligations.
                </BodyText>
              </SubSection>
              <SubSection title="3.4 Partner Store Accounts">
                <BodyText>
                  {/* "₦500 per package" removed 2026-08-15. The fee lives in
                      the admin Fee Catalogue and is agreed per partner at
                      onboarding; a number hardcoded in a legal document
                      drifts from the catalogue the first time it is tuned,
                      and publishes partner economics besides. */}
                  Physical store operators who receive and hold packages on behalf of customers.
                  Partner stores earn a per-package fee as set out in their partner agreement.
                  Weekly payouts are processed every Monday. Stores must maintain the agreed
                  storage capacity and operating hours.
                </BodyText>
              </SubSection>
            </Section>

            <Section id="section-4" title="4. Prohibited Items">
              <div className="bg-amber-50 border-l-4 border-warning-amber rounded-r-card p-5 mb-4">
                <BodyText>
                  <strong>The following items are strictly prohibited from our platform:</strong>
                </BodyText>
              </div>
              <BulletList
                items={[
                  "Illegal substances, narcotics, or controlled drugs",
                  "Weapons, firearms, ammunition, or explosives",
                  "Stolen goods or counterfeit products",
                  "Perishable items without prior arrangement",
                  "Hazardous materials (flammable, corrosive, toxic, or radioactive)",
                  "Live animals",
                  "Currency, bearer bonds, or negotiable instruments exceeding ₦500,000",
                  "Items prohibited under Nigerian law",
                ]}
              />
              <BodyText>
                Seirs reserves the right to refuse, cancel, or report any delivery we reasonably
                suspect contains prohibited items. The sender is solely liable for the contents
                of any package.
              </BodyText>
            </Section>

            <Section id="section-5" title="5. Pricing and Fees">
              <BulletList
                items={[
                  "Delivery prices are calculated based on distance, weight, vehicle type, and current fuel/FX rates",
                  "Prices displayed at order creation are estimates; final prices may vary for actual weight/distance",
                  "All prices are in Nigerian Naira (₦)",
                  "Seirs reserves the right to adjust pricing with 7 days' notice for non-contracted accounts",
                  "Drivers receive a platform-determined share of the delivery fee; rates may change with 14 days' notice",
                  "Business accounts receive loyalty points (₦10 per point) redeemable against future deliveries",
                ]}
              />
            </Section>

            <Section id="section-6" title="6. Payments and Refunds">
              <BulletList
                items={[
                  "Payments are processed via Flutterwave, a CBN-licensed payment service provider",
                  "Business wallet top-ups are processed immediately; they are non-refundable once delivery orders are created using those funds",
                  // Corrected 2026-08-14. These two clauses told every customer
                  // they held a Seirs cash balance they could withdraw from.
                  // Customer accounts do not hold NGN: only business accounts
                  // carry a prepaid wallet, and only drivers and partner stores
                  // withdraw to a bank. Promising a consumer balance is the CBN
                  // problem, and it was live in a legal document.
                  "Refunds for failed or cancelled deliveries are returned to the original payment method. Card refunds typically settle within 5–10 business days depending on your bank. Business accounts are credited back to the business wallet within 24 hours",
                  "Withdrawals to a Nigerian bank account are available to drivers and partner stores, processed within 3–5 business days and subject to identity verification. Customer accounts do not hold a cash balance",
                  "Driver and partner store payouts are processed weekly every Monday; Seirs is not liable for delays caused by bank infrastructure",
                ]}
              />
            </Section>

            <Section id="section-7" title="7. Delivery Terms">
              <BulletList
                items={[
                  "Estimated delivery times are not guaranteed; they depend on traffic, weather, and driver availability",
                  "Maximum liability for lost or damaged packages is ₦50,000 per package unless a higher declared value is agreed in writing",
                  "Claims for lost or damaged packages must be submitted within 48 hours of the estimated delivery time",
                  "Seirs is not liable for packages that cannot be delivered due to inaccessible addresses, recipient unavailability after two attempts, or customer-provided incorrect information",
                ]}
              />
            </Section>

            <Section id="section-8" title="8. Undeliverable Packages, Storage and Disposal">
              <BodyText>
                This section applies when a package cannot be handed to the recipient at
                the delivery address. It sets out what we do, what it costs, and how long
                we hold a package before it is treated as abandoned. Where an amount is
                shown in the Seirs app at the time of booking, that amount applies.
              </BodyText>

              <SubSection title="8.1 Failed delivery attempts">
                <BulletList
                  items={[
                    "Where a driver arrives and cannot complete the handover, the driver will attempt to contact the sender and, where a channel is available, the recipient",
                    "If there is no response within the response window shown in the app, the matter is escalated to Seirs support",
                    "Where support does not resolve the matter within the timeout shown in the app, the package may be moved to the nearest available Seirs partner counter for safekeeping",
                    "The sender and, where a channel is available, the recipient will be notified before a package is moved, including the counter location, the amount payable and the collection deadline",
                  ]}
                />
              </SubSection>

              <SubSection title="8.2 Redirection and counter fees">
                <BulletList
                  items={[
                    "Moving a package to a partner counter attracts a redirection fee reflecting the additional distance travelled and the counter's intake charge",
                    "Where the failure arises from the recipient's unavailability or an incorrect address supplied by the sender, the redirection and counter fees are payable by the party responsible",
                    "Where the failure arises from an error by Seirs, no redirection or counter fee is charged",
                    "A collection code is issued only once any amount due has been settled in the app. Partner counter staff do not collect payment and are not authorised to release a package without a valid code",
                  ]}
                />
              </SubSection>

              <SubSection title="8.3 Storage">
                <BulletList
                  items={[
                    "Packages held at a partner counter are stored free of charge for the free storage window shown in the app",
                    "After that window, storage accrues daily at the rate shown in the app until the package is collected, returned or disposed of",
                    "Storage charges are payable before the package is released",
                    "Seirs holds packages as bailee only and does not insure stored packages beyond the liability limit in Section 7",
                  ]}
                />
              </SubSection>

              <SubSection title="8.4 Perishable and temperature-sensitive items">
                <BodyText>
                  Food and other perishable or temperature-sensitive items cannot be stored.
                  Where such an item cannot be delivered, Seirs will attempt to contact the
                  sender, and if the item cannot be delivered or returned within the
                  perishable window shown in the app, it may be disposed of on the same day.
                  Photographic evidence of disposal is retained. No refund of the delivery
                  fee is due where the failure did not arise from an error by Seirs.
                </BodyText>
              </SubSection>

              <SubSection title="8.5 Uncollected packages and abandonment">
                <BulletList
                  items={[
                    "A package that remains uncollected beyond the abandonment threshold shown in the app may be treated as abandoned",
                    "Before a package is treated as abandoned, Seirs will give notice to the sender and, where a channel is available, the recipient, stating the deadline and the amounts outstanding",
                    "Seirs may dispose of an abandoned package. Disposal is recorded with photographic evidence and the record is retained",
                    "Amounts outstanding at the point of disposal remain payable and disposal does not extinguish them",
                    "Seirs does not sell abandoned packages",
                  ]}
                />
              </SubSection>

              <SubSection title="8.6 Return to sender">
                <BulletList
                  items={[
                    "A sender may request that an undeliverable package be returned to the original pickup address. The pickup address for a return cannot be changed",
                    "A return is charged as a delivery from the package's current location to the pickup address, together with any counter and storage fees already accrued",
                    "Where a package is already with a driver, a return must be arranged through Seirs support before the driver is redirected",
                  ]}
                />
              </SubSection>

              <SubSection title="8.7 Recipient obligations">
                <BulletList
                  items={[
                    "A sender is responsible for supplying a correct delivery address and correct recipient contact details",
                    "Where a recipient is not a registered Seirs user, notifications depend on the contact details supplied by the sender and Seirs cannot guarantee that they are received",
                    "Charges arising from an incorrect address or unreachable recipient are payable by the sender",
                  ]}
                />
              </SubSection>
            </Section>

            <Section id="section-9" title="9. Acceptable Use">
              <BodyText>You agree not to:</BodyText>
              <BulletList
                items={[
                  "Use the platform for any unlawful purpose",
                  "Attempt to gain unauthorised access to any part of our systems",
                  "Reverse-engineer, scrape, or copy our platform",
                  "Create fake accounts, impersonate others, or provide false information",
                  "Use our platform to harass, defraud, or harm other users",
                  "Circumvent payment systems or attempt to avoid legitimate fees",
                ]}
              />
            </Section>

            <Section id="section-10" title="10. Suspension and Termination">
              <BodyText>
                Seirs may suspend or permanently deactivate your account, with or without
                notice, if:
              </BodyText>
              <BulletList
                items={[
                  "You violate these Terms",
                  "We suspect fraudulent activity",
                  "You provide false registration information",
                  "You cause harm to other users, drivers, or partner stores",
                  "Required by law or regulatory order",
                ]}
              />
              <BodyText>
                You may close your account at any time by contacting support. Outstanding wallet
                balances will be refunded to a verified Nigerian bank account within 14 business
                days.
              </BodyText>
            </Section>

            <Section id="section-11" title="11. Intellectual Property">
              <BodyText>
                All content, software, trademarks, and designs on the Seirs platform are owned
                by Seirs Logistics Ltd or licensed to us. You may not reproduce, distribute, or
                create derivative works without express written permission.
              </BodyText>
            </Section>

            <Section id="section-12" title="12. Privacy">
              <BodyText>
                Our collection and use of personal data is governed by our{" "}
                <Link href="/privacy-policy" className="text-sky hover:underline">
                  Privacy Policy
                </Link>
                , which is incorporated into these Terms by reference.

              </BodyText>
            </Section>

            <Section id="section-13" title="13. Disclaimer of Warranties">
              <BodyText>
                The platform is provided &quot;as is&quot; and &quot;as available.&quot; Seirs does not warrant
                uninterrupted or error-free operation. We are not liable for losses arising
                from service interruptions, third-party failures (banks, telecoms, map
                providers), or circumstances beyond our control (force majeure).
              </BodyText>
            </Section>

            <Section id="section-14" title="14. Limitation of Liability">
              <BodyText>
                To the maximum extent permitted by Nigerian law, Seirs&apos; total liability to
                you for any claim arising from use of our services is limited to the amount
                you paid us in the 3 months preceding the claim. We are not liable for
                indirect, consequential, or punitive damages.
              </BodyText>
            </Section>

            <Section id="section-15" title="15. Governing Law and Disputes">
              <BodyText>
                These Terms are governed by the laws of the Federal Republic of Nigeria. Any
                dispute shall first be subject to good-faith negotiation. If unresolved,
                disputes shall be referred to arbitration under the Arbitration and Conciliation
                Act (as amended), with Lagos as the seat of arbitration.
              </BodyText>
            </Section>

            <Section id="section-16" title="16. Changes to Terms">
              <BodyText>
                We may update these Terms. We will notify you via email or in-app notification
                at least 14 days before material changes take effect. Continued use after the
                effective date constitutes acceptance of the new terms.
              </BodyText>
            </Section>

            <Section id="section-17" title="17. Contact">
              <BodyText>
                For any queries about these Terms:{" "}
                <a href="mailto:legal@seirs.co" className="text-sky hover:underline">
                  legal@seirs.co
                </a>
              </BodyText>
              <BodyText>
                For support:{" "}
                <a href="mailto:support@seirs.co" className="text-sky hover:underline">
                  support@seirs.co
                </a>
              </BodyText>
            </Section>

            {/* Footer note */}
            <div className="mt-10 pt-8 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Mail size={15} className="text-sky" />
                  <span>
                    Questions?{" "}
                    <a href="mailto:legal@seirs.co" className="text-sky hover:underline">
                      legal@seirs.co
                    </a>
                  </span>
                </div>
                <Link
                  href="/privacy-policy"
                  className="text-sky hover:underline text-sm font-medium"
                >
                  View Privacy Policy &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
