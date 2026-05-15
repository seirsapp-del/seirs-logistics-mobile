import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Mail, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Seirs Logistics Ltd privacy policy — how we collect, use, and protect your personal data in compliance with NDPR 2019 and NDPA 2023.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-navy mb-4 pb-2 border-b border-gray-100">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
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

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-off-white min-h-screen">
      {/* Page header */}
      <div className="bg-navy py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-sky/20 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-sky" />
            </div>
            <div className="text-sky text-sm font-semibold tracking-wider uppercase">
              Legal Document
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-3">
            Privacy Policy
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
                {[
                  "Who We Are",
                  "Data We Collect",
                  "How We Use Your Data",
                  "Legal Basis",
                  "Data Sharing",
                  "Data Retention",
                  "Data Security",
                  "Your Rights",
                  "Cookies",
                  "Children's Privacy",
                  "International Transfers",
                  "Changes",
                  "Contact",
                ].map((item, i) => (
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
            {/* Highlight box */}
            <div className="bg-blue-50 border-l-4 border-sky rounded-r-card p-5 mb-8">
              <BodyText>
                Seirs is committed to protecting your personal data in compliance with the{" "}
                <strong>Nigeria Data Protection Regulation (NDPR) 2019</strong> and the{" "}
                <strong>Nigeria Data Protection Act 2023 (NDPA)</strong>. This policy explains
                what we collect, why, and your rights.
              </BodyText>
            </div>

            <div id="section-1">
              <Section title="1. Who We Are">
                <BodyText>
                  Seirs Logistics Ltd (&quot;Seirs&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates a technology
                  platform connecting businesses, customers, drivers, and partner stores for
                  last-mile delivery services in Nigeria. Our registered office is in Nigeria.
                  Contact us at{" "}
                  <a href="mailto:privacy@seirs.co" className="text-sky hover:underline">
                    privacy@seirs.co
                  </a>
                  .
                </BodyText>
              </Section>
            </div>

            <div id="section-2">
              <Section title="2. Data We Collect">
                <BodyText>
                  We collect the following categories of personal data:
                </BodyText>
                <BulletList
                  items={[
                    <><strong>Identity data:</strong> Full name, date of birth (for age verification)</>,
                    <><strong>Contact data:</strong> Email address, phone number</>,
                    <><strong>Account data:</strong> Account ID, account type (customer, business sender, partner store, driver), password (stored as a bcrypt hash — never in plain text)</>,
                    <><strong>Business data:</strong> Company name, RC number, business address (for business accounts)</>,
                    <><strong>Location data:</strong> Pickup and delivery addresses, real-time GPS coordinates during active deliveries (drivers only)</>,
                    <><strong>Financial data:</strong> Wallet balance, transaction history, payout records. We do not store full card numbers — payment processing is handled by our PCI-DSS compliant partner (Flutterwave).</>,
                    <><strong>Usage data:</strong> App activity logs, device type, IP address, session duration</>,
                    <><strong>Communications:</strong> Support messages, dispute details</>,
                  ]}
                />
              </Section>
            </div>

            <div id="section-3">
              <Section title="3. How We Use Your Data">
                <BulletList
                  items={[
                    "To create and manage your account",
                    "To process, match, and track delivery orders",
                    "To process payments and maintain wallet balances",
                    "To send transactional emails and push notifications (delivery updates, OTP codes, payout confirmations)",
                    "To verify your identity and prevent fraud",
                    "To calculate earnings and issue partner store payouts",
                    "To improve our platform and services through anonymised analytics",
                    "To comply with applicable Nigerian law",
                  ]}
                />
              </Section>
            </div>

            <div id="section-4">
              <Section title="4. Legal Basis for Processing">
                <BulletList
                  items={[
                    <><strong>Contract performance:</strong> Processing necessary to deliver the services you signed up for</>,
                    <><strong>Legitimate interests:</strong> Fraud prevention, platform security, service improvement</>,
                    <><strong>Consent:</strong> Marketing communications (you can withdraw at any time)</>,
                    <><strong>Legal obligation:</strong> Compliance with Nigerian law, tax obligations, CBN regulations</>,
                  ]}
                />
              </Section>
            </div>

            <div id="section-5">
              <Section title="5. Data Sharing">
                <BodyText>We share your data only with:</BodyText>
                <BulletList
                  items={[
                    <><strong>Drivers:</strong> Your name, phone number, and delivery address are shared with your assigned driver to complete a delivery</>,
                    <><strong>Partner stores:</strong> Recipient name and package tracking number are shared with the partner store holding your package</>,
                    <>
                      <strong>Flutterwave:</strong> Payment processing — governed by{" "}
                      <a
                        href="https://flutterwave.com/privacy-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky hover:underline inline-flex items-center gap-1"
                      >
                        Flutterwave&apos;s Privacy Policy
                        <ExternalLink size={11} />
                      </a>
                    </>,
                    <><strong>Google:</strong> Maps and location services — governed by Google&apos;s Privacy Policy</>,
                    <><strong>Firebase (Google):</strong> Push notification delivery</>,
                    <><strong>Railway / cloud infrastructure providers:</strong> Hosting and data storage</>,
                    <><strong>Law enforcement:</strong> Only when required by a valid Nigerian court order or legal process</>,
                  ]}
                />
                <BodyText>
                  <strong>We do not sell your personal data to third parties.</strong>
                </BodyText>
              </Section>
            </div>

            <div id="section-6">
              <Section title="6. Data Retention">
                <BulletList
                  items={[
                    "Active accounts: Data retained for the lifetime of the account",
                    "Deleted accounts: Personal identifiers deleted within 30 days; anonymised transaction records retained for 7 years for regulatory compliance",
                    "Unverified accounts: Deleted after 30 days of no activity",
                    "Driver GPS logs: Retained for 90 days after delivery completion",
                  ]}
                />
              </Section>
            </div>

            <div id="section-7">
              <Section title="7. Data Security">
                <BodyText>
                  We implement industry-standard security measures including:
                </BodyText>
                <BulletList
                  items={[
                    "Passwords hashed using bcrypt (cost factor 12) — never stored in plain text",
                    "OTP codes hashed and expire in 15 minutes",
                    "All data in transit encrypted via TLS 1.2+",
                    "JWT authentication tokens with server-side validation",
                    "Rate limiting on all authentication endpoints",
                    "HTTP security headers (CSP, HSTS, X-Frame-Options) via Helmet",
                    "CORS restricted to declared application origins",
                    "Access controls: admin actions require role-based authorisation",
                  ]}
                />
              </Section>
            </div>

            <div id="section-8">
              <Section title="8. Your Rights Under NDPA 2023">
                <BodyText>As a data subject, you have the right to:</BodyText>
                <BulletList
                  items={[
                    <><strong>Access:</strong> Request a copy of personal data we hold about you</>,
                    <><strong>Correction:</strong> Request correction of inaccurate data</>,
                    <><strong>Deletion:</strong> Request deletion of your account and personal data (subject to legal retention requirements)</>,
                    <><strong>Portability:</strong> Receive your data in a machine-readable format</>,
                    <><strong>Objection:</strong> Object to processing based on legitimate interests</>,
                    <><strong>Withdraw consent:</strong> For any processing based on your consent</>,
                  ]}
                />
                <BodyText>
                  To exercise any right, email{" "}
                  <a href="mailto:privacy@seirs.co" className="text-sky hover:underline">
                    privacy@seirs.co
                  </a>
                  . We will respond within 30 days.
                </BodyText>
              </Section>
            </div>

            <div id="section-9">
              <Section title="9. Cookies">
                <BodyText>
                  Our mobile apps do not use cookies. Our admin dashboard uses session cookies
                  strictly necessary for authentication. We do not use tracking or advertising cookies.
                </BodyText>
              </Section>
            </div>

            <div id="section-10">
              <Section title="10. Children's Privacy">
                <BodyText>
                  Our services are not directed to persons under 18 years of age. By registering,
                  you confirm you are at least 18. If we become aware that a minor has registered,
                  we will delete their account immediately.
                </BodyText>
              </Section>
            </div>

            <div id="section-11">
              <Section title="11. International Transfers">
                <BodyText>
                  Your data is stored on servers located in the European Union and United States
                  (via our cloud infrastructure providers). Such transfers are made with
                  appropriate safeguards including standard contractual clauses.
                </BodyText>
              </Section>
            </div>

            <div id="section-12">
              <Section title="12. Changes to This Policy">
                <BodyText>
                  We may update this policy. We will notify you by email or in-app notification
                  for material changes. Continued use of our services after the effective date
                  constitutes acceptance.
                </BodyText>
              </Section>
            </div>

            <div id="section-13">
              <Section title="13. Contact & Complaints">
                <BodyText>
                  For privacy queries:{" "}
                  <a href="mailto:privacy@seirs.co" className="text-sky hover:underline">
                    privacy@seirs.co
                  </a>
                </BodyText>
                <BodyText>
                  If you are dissatisfied with our response, you may lodge a complaint with the{" "}
                  <strong>Nigeria Data Protection Commission (NDPC)</strong> at{" "}
                  <a
                    href="https://ndpc.gov.ng"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky hover:underline inline-flex items-center gap-1"
                  >
                    ndpc.gov.ng
                    <ExternalLink size={11} />
                  </a>
                  .
                </BodyText>
              </Section>
            </div>

            {/* Footer note */}
            <div className="mt-10 pt-8 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Mail size={15} className="text-sky" />
                  <span>
                    Questions?{" "}
                    <a href="mailto:privacy@seirs.co" className="text-sky hover:underline">
                      privacy@seirs.co
                    </a>
                  </span>
                </div>
                <Link
                  href="/terms-of-service"
                  className="text-sky hover:underline text-sm font-medium"
                >
                  View Terms of Service &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
