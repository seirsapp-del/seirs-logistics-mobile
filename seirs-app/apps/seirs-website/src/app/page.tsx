import Link from "next/link";
import { getPageBlock, getImageSlots } from "@/lib/cms";
import { Reveal } from "@/components/Reveal";
import { GetAppButton } from "@/components/GetAppButton";
import { AppScreenshot } from "@/components/AppScreenshot";
import {
  Package,
  Truck,
  MapPin,
  CheckCircle,
  Users,
  BarChart3,
  Wallet,
  Upload,
  Shield,
  Headphones,
  Star,
  ArrowRight,
  Zap,
  Store,
  DollarSign,
  Smartphone,
  ChevronRight,
  Globe,
} from "lucide-react";

/* ── Hero scene: bespoke okada illustration in the logo's own visual
   language (founder 2026-08-11: no warehouses, no stock photos; the
   brand mark's bold-stroke stick-okada extended into a street scene).
   Same geometry rules as SeirsMarkBold: fat round strokes, circle
   wheels, the yellow package as the star. ── */
function HeroIllustration() {
  return (
    <div className="relative w-full h-full min-h-[140px] sm:min-h-[220px] lg:min-h-[380px] flex items-center justify-center">
      {/* The SVG scales to its column (max-w-full). Since the hero holds two
          columns at every width now, that column is ~171px on a 390px phone,
          so the okada renders about 171x140 at 0.39 scale and the 13px
          strokes land near 5px. That is the cost of matching the desktop
          arrangement on a phone: it reads as a small emblem beside the copy
          rather than a full illustration. min-h tracks the scaled height at
          each breakpoint so no dead navy opens up under it. */}
      <svg width="440" height="360" viewBox="0 0 440 360" fill="none" className="max-w-full h-auto">
        {/* Lagos skyline silhouette */}
        <g fill="white" fillOpacity="0.07">
          <rect x="18"  y="90"  width="42" height="130" rx="4" />
          <rect x="70"  y="60"  width="54" height="160" rx="4" />
          <rect x="134" y="110" width="38" height="110" rx="4" />
          <rect x="300" y="80"  width="48" height="140" rx="4" />
          <rect x="358" y="120" width="40" height="100" rx="4" />
        </g>
        {/* Lit windows: brand yellow, sparse */}
        <g fill="#FFBE0B" fillOpacity="0.55">
          <rect x="84"  y="78"  width="8" height="8" rx="2" />
          <rect x="102" y="106" width="8" height="8" rx="2" />
          <rect x="314" y="98"  width="8" height="8" rx="2" />
          <rect x="30"  y="112" width="8" height="8" rx="2" />
        </g>

        {/* Dashed route line: pickup -> rider -> destination */}
        <path
          d="M 40 268 C 120 240, 180 296, 240 262 S 380 226, 408 252"
          stroke="#3A7BD5" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" fill="none"
        />
        {/* Pickup pin */}
        <circle cx="40" cy="268" r="9" fill="#3A7BD5" />
        <circle cx="40" cy="268" r="4" fill="white" />
        {/* Destination pin: delivered green */}
        <circle cx="408" cy="252" r="11" fill="#16A34A" />
        <path d="M 403 252 l 4 4 l 7 -8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        {/* Okada + rider: the SeirsMarkBold language, scene-sized */}
        <g className="animate-float" stroke="white" strokeWidth="13" strokeLinecap="round">
          {/* wheels */}
          <circle cx="165" cy="292" r="26" fill="none" />
          <circle cx="269" cy="292" r="26" fill="none" />
          {/* frame */}
          <path d="M 165 292 L 205 258 L 251 258 L 269 292" fill="none" strokeLinejoin="round" />
          {/* rider: torso + head + arm reaching the bars */}
          <path d="M 214 258 L 226 210" />
          <path d="M 226 210 L 258 224" />
          <circle cx="230" cy="190" r="14" fill="white" stroke="none" />
        </g>
        {/* The yellow package riding pillion: the brand's hero object */}
        <g className="animate-float">
          <rect x="176" y="222" width="34" height="30" rx="6" fill="#FFBE0B" />
          <line x1="193" y1="222" x2="193" y2="252" stroke="#0F2B4C" strokeWidth="3" />
          <line x1="176" y1="237" x2="210" y2="237" stroke="#0F2B4C" strokeWidth="3" />
        </g>

        {/* Motion whiskers behind the okada */}
        <g stroke="white" strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round">
          <line x1="96"  y1="270" x2="128" y2="270" />
          <line x1="82"  y1="288" x2="122" y2="288" />
          <line x1="100" y1="306" x2="126" y2="306" />
        </g>

        {/* Street */}
        <line x1="20" y1="330" x2="420" y2="330" stroke="white" strokeOpacity="0.25" strokeWidth="4" strokeLinecap="round" />
        <g stroke="#FFBE0B" strokeOpacity="0.7" strokeWidth="4" strokeLinecap="round">
          <line x1="60"  y1="330" x2="84"  y2="330" />
          <line x1="150" y1="330" x2="174" y2="330" />
          <line x1="240" y1="330" x2="264" y2="330" />
          <line x1="330" y1="330" x2="354" y2="330" />
        </g>
      </svg>

      {/* Abstract geometric circles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div className="absolute -top-10 -right-10 w-48 h-48 border border-white/10 rounded-full" />
        <div className="absolute -top-20 -right-20 w-72 h-72 border border-white/5 rounded-full" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 border border-white/8 rounded-full" />
      </div>
    </div>
  );
}

/* StepCard removed 2026-08-14: the How It Works section it served is now one
   app screenshot with the three steps listed beside it, so nothing rendered
   this any more. Note for the admin side: the img_step_book, img_step_pickup
   and img_step_delivered slots under Website > Page Blocks are now orphaned.
   Uploading to them has no effect on the site until they are either wired
   somewhere else or removed from the admin. */

/* FeatureCard removed 2026-08-14: the six business feature cards were folded
   into a compact labelled list inside the copy column, so nothing renders a
   card any more. */

/* DriverBenefit removed 2026-08-14 with the driver band it belonged to.
   That band was the only place img_driver_portrait rendered anywhere on the
   site, so the slot is now fully orphaned and has been pulled from the
   admin's list, same as the img_step_* slots. */

/* ── Testimonial Card ── */
function TestimonialCard({
  quote,
  name,
  role,
  location,
  rating,
}: {
  quote: string;
  name: string;
  role: string;
  location: string;
  rating: number;
}) {
  return (
    <div className="bg-white rounded-card p-7 shadow-sm border border-gray-100 flex flex-col">
      {/* Quote mark */}
      <div className="text-navy font-black text-5xl leading-none mb-4 opacity-20 select-none">
        &ldquo;
      </div>
      <p className="text-text-dark text-sm leading-relaxed flex-grow mb-5">
        {quote}
      </p>
      <div className="flex items-center gap-1 mb-4">
        {Array.from({ length: rating }).map((_, i) => (
          <Star key={i} size={14} className="text-warning-amber fill-warning-amber" />
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
        <div className="w-10 h-10 bg-navy/10 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-navy font-bold text-sm">{name.charAt(0)}</span>
        </div>
        <div>
          <div className="text-navy font-bold text-sm">{name}</div>
          <div className="text-text-muted text-xs">{role} · {location}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Partner Benefit ── */
function PartnerBenefit({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="lift flex flex-col items-center text-center p-6 bg-white rounded-card shadow-sm border border-gray-100">
      <div className="w-14 h-14 bg-sky/10 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={26} className="text-sky" />
      </div>
      <h4 className="text-navy font-bold text-base mb-2">{title}</h4>
      <p className="text-text-muted text-sm leading-relaxed">{description}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════ */

// Revalidate ISR every 60s so CMS edits to the hero block land on the
// marketing site within ~1 min without a redeploy.
export const revalidate = 60;

export default async function HomePage() {
  // Inline-editable hero block, falls back to the hardcoded copy below
  // when the CMS row is missing or unreachable, so marketing can edit
  // without breaking the page.
  const [hero, img] = await Promise.all([getPageBlock('home_hero'), getImageSlots()]);

  return (
    <>
      {/* ── HERO ── */}
      <section
        className="relative overflow-hidden min-h-[90vh] flex items-center"
        style={{
          background: "linear-gradient(135deg, #0F2B4C 0%, #1a3a5c 60%, #0F2B4C 100%)",
        }}
      >
        {/* Admin-editable hero backdrop: falls back to the pure gradient
            when the CMS row is unset so marketing can add/remove without
            a code deploy. Kept darkened (opacity 25) so foreground text
            stays readable regardless of the uploaded image. */}
        {(img.img_hero_rider || hero?.coverImageUrl) && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: `url(${img.img_hero_rider ?? hero?.coverImageUrl})` }}
          />
        )}
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        {/* Top padding 2026-08-14 (founder: "send anything could be bigger
            since we have empty space up"). 96px of vertical padding on a
            phone was most of that gap, so it starts at 32px and steps back
            up. The reclaimed space goes into the headline. */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 lg:py-24 w-full">
          {/* Founder 2026-08-14, phone layout: okada beside the headline, the
              two CTAs side by side underneath it, then the language line and
              the trust row each on a single line. So the hero is now one grid
              whose items are placed individually, rather than a copy column
              plus an art column. On a phone only the headline shares its row
              with the okada; everything else spans both columns. From lg up
              the okada is pinned to column 2 across every row and the rest
              stacks in column 1, which is the original desktop hero. */}
          <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 lg:gap-x-16 items-center">
            <div className="col-span-2 lg:col-span-1 lg:col-start-1">
              {/* Founder 2026-08-14: Nigeria, not Lagos, at every width. The
                  platform is not a Lagos-only product and the chip was the
                  one place still saying otherwise. The "join the first wave"
                  half stays desktop-only: at 390px it pushed the chip to a
                  second line, which is the empty space the headline wanted. */}
              <div className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/10 border border-white/20 rounded-full px-2.5 py-1 lg:px-4 lg:py-1.5 mb-3 lg:mb-6">
                <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-[#FFBE0B] rounded-full animate-pulse flex-shrink-0" />
                <span className="text-white/80 text-[10px] lg:text-xs font-medium leading-tight">
                  Launching in Nigeria
                  <span className="hidden lg:inline">: join the first wave</span>
                </span>
              </div>
            </div>

            {/* Headline and lede: the only block that shares a row with the
                okada on a phone, so it carries the narrow-column type scale. */}
            <div className="lg:col-start-1">
              {/* Founder 2026-08-14: "send anything could be bigger". Was
                  18px, now 26px on a phone. That is the largest the ~171px
                  column takes before the longest word in the fallback
                  headline, "Nigeria's", starts to overhang. */}
              <h1 className="text-[26px] sm:text-3xl md:text-4xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-2 lg:mb-6 tracking-tight">
                {hero?.title ?? (
                  <>
                    Nigeria&apos;s Smartest
                    <br />
                    <span className="text-[#FFBE0B]">Last-Mile Delivery</span>
                    <br />
                    Platform
                  </>
                )}
              </h1>

              <p className="text-white/70 text-xs sm:text-base lg:text-lg leading-relaxed mb-5 lg:mb-8 max-w-lg">
                {hero?.excerpt ??
                  'Send thousands of packages with one click. Real-time tracking, business wallets, and a network of verified drivers and partner stores across Nigeria.'}
              </p>
            </div>

            {/* The okada. On a phone it takes column 2 of the headline row,
                so it sits beside "Send anything, anywhere" rather than under
                the buttons. From lg it is pinned to column 2 spanning every
                row, which is the original desktop placement. */}
            <div className="lg:col-start-2 lg:row-start-1 lg:row-span-5 lg:self-center">
              <HeroIllustration />
            </div>

            {/* Founder: the two CTAs go side by side underneath the okada
                row, not stacked. flex-row at every width, and they get the
                full page width back now that they are out of the narrow
                column, so the phone padding can come back up a little. */}
            <div className="col-span-2 lg:col-span-1 lg:col-start-1 flex flex-row gap-2 lg:gap-4 mb-6 lg:mb-14">
                <GetAppButton
                  app="customer"
                  className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 lg:gap-2 bg-white text-navy font-bold px-3 py-3 lg:px-8 lg:py-4 rounded-btn hover:bg-gray-50 transition-colors shadow-xl text-[13px] sm:text-sm lg:text-base whitespace-nowrap"
                >
                  Start Sending
                  <ArrowRight size={16} className="flex-shrink-0" />
                </GetAppButton>
                <Link
                  href="/for-drivers"
                  className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-3 py-3 lg:px-8 lg:py-4 rounded-btn hover:bg-white/10 transition-colors text-[13px] sm:text-sm lg:text-base whitespace-nowrap"
                >
                  Become a Driver
                </Link>
              </div>

              {/* Honesty pass 2026-08-12: the old banner implied the SITE
                  ships in four languages. Truth: the APPS carry Yoruba /
                  Igbo / Hausa translations (improving, see the language
                  story), and this site is English with browser
                  translation. Say exactly that. */}
              {/* Founder: this reads as one line on a phone. The full
                  sentence wrapped to three, so the invitation to read the
                  story is desktop-only and the claim itself, which is the
                  part that matters, stays whole. */}
              <Link
                href="/news/speaking-nigerian-languages"
                className="col-span-2 lg:col-span-1 lg:col-start-1 w-fit inline-flex items-center gap-2 lg:gap-2.5 bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 lg:px-3 lg:py-2 mb-6 lg:mb-8 hover:bg-white/10 transition-colors"
              >
                <Globe size={13} className="text-[#FFBE0B] flex-shrink-0" strokeWidth={1.75} />
                <span className="text-white/65 text-[11px] lg:text-xs whitespace-nowrap">
                  The apps speak Yoruba, Igbo and Hausa.
                  <span className="hidden lg:inline"> Read how we&apos;re improving that</span>
                </span>
              </Link>

              {/* Value props, not vanity metrics. Honesty rule 2026-08-11:
                  the old fake stats (10,000+ deliveries, 99.2% on-time)
                  claimed history a pre-launch platform does not have, and
                  an on-time percentage is a promise we never make. */}
              {/* Founder: 24/7, Live, Verified and Escrow read as one line on
                  a phone. Was a 2x2 block; now four across at every width,
                  which puts each cell at roughly 83px on a 390px screen, so
                  the value drops to 14px and the label to 9px to fit. */}
              <div className="col-span-2 lg:col-span-1 lg:col-start-1 grid grid-cols-4 gap-2 lg:gap-4">
                {[
                  { value: "24/7", label: "Pickups, day & night" },
                  { value: "Live", label: "GPS tracking" },
                  { value: "Verified", label: "ID-checked drivers" },
                  { value: "Escrow", label: "Pay on delivery" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white/10 border border-white/15 rounded-card px-1.5 py-2.5 lg:px-4 lg:py-4 text-center"
                  >
                    <div className="text-white font-extrabold text-sm lg:text-xl">{stat.value}</div>
                    <div className="text-white/55 text-[9px] lg:text-xs mt-0.5 leading-tight">{stat.label}</div>
                  </div>
                ))}
              </div>

          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none" className="w-full h-12">
            <path d="M0 60L1440 60L1440 20C1200 50 960 60 720 40C480 20 240 0 0 20L0 60Z" fill="#F5F5F0" />
          </svg>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Simple Process</p>
            <h2 className="section-title mb-4">How It Works</h2>
            <p className="section-sub">
              From order creation to doorstep delivery, Seirs makes logistics effortless.
            </p>
          </div>

          {/* Rebuilt 2026-08-14. Founder asked for one screenshot of the app
              with the three explanations beside it, rather than three cards
              each carrying their own image. One screen anchors the section,
              the steps read as a list next to it, and on a phone the screen
              sits on top with the three steps underneath, so the whole
              section fits in about one and a half screens instead of three
              stacked cards.

              The old step 1 copy said you "pay instantly from your Seirs
              wallet". Customers do not hold NGN balances, per CBN rules and
              our own standing rule that the customer side never says Wallet.
              Corrected to card payment, which is what actually happens. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center max-w-5xl mx-auto">
            <Reveal>
              <AppScreenshot
                screen="customerBooking"
                alt="Creating a delivery in the Seirs customer app"
              />
            </Reveal>

            <div className="space-y-6 lg:space-y-8">
              {[
                {
                  n: 1,
                  icon: Package,
                  title: "Create a Delivery",
                  body: "Add your pickup and drop-off address, describe your package, and pay by card. Bulk orders? Upload a CSV and process hundreds at once.",
                },
                {
                  n: 2,
                  icon: Truck,
                  title: "Driver Picks Up",
                  body: "A verified, background-checked driver is assigned and dispatched to your pickup in minutes. You get their name, photo and live location.",
                },
                {
                  n: 3,
                  icon: MapPin,
                  title: "Real-Time Tracking",
                  body: "Follow the journey on the map. Push notifications at every milestone: dispatched, picked up, nearby, delivered.",
                },
              ].map((s, i) => (
                <Reveal key={s.n} delay={i * 120}>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-navy text-white flex items-center justify-center font-extrabold text-sm">
                      {s.n}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <s.icon size={18} className="text-sky flex-shrink-0" strokeWidth={1.75} />
                        <h3 className="text-navy font-bold text-base sm:text-lg">{s.title}</h3>
                      </div>
                      <p className="text-text-muted text-sm leading-relaxed">{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR BUSINESSES ── */}
      <section id="for-business" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            {/* Left: text */}
            <Reveal><div>
              <p className="section-label mb-3">Business Accounts</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-navy leading-tight mb-4">
                Built for Nigerian Businesses
              </h2>
              <p className="text-text-muted text-lg leading-relaxed mb-6">
                Whether you ship 10 parcels a day or 10,000 a month, Seirs scales with you. Manage your entire logistics operation from one dashboard, no spreadsheets, no chasing drivers.
              </p>
              {/* Founder 2026-08-14: fold the six feature cards into where the
                  rate-card paragraph sat, and make them terser still. That
                  paragraph was itself a spec disclosure, naming the rate-card
                  components and the roles-and-limits design, so the swap
                  removes the last of that from this section and buys back the
                  length the six cards were spending. */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-8">
                {[
                  { icon: Upload, label: "Bulk CSV upload" },
                  { icon: Wallet, label: "One prepaid balance" },
                  { icon: Users, label: "Your team, your limits" },
                  { icon: Zap, label: "Saved routes" },
                  { icon: MapPin, label: "Multi-stop runs" },
                  { icon: Headphones, label: "A human on support" },
                ].map((f) => (
                  <div key={f.label} className="flex items-center gap-2.5">
                    <f.icon size={16} className="text-sky flex-shrink-0" strokeWidth={1.75} />
                    <span className="text-text-dark text-xs sm:text-sm font-medium">
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-navy text-white font-bold px-5 py-3 sm:px-8 sm:py-4 rounded-btn hover:bg-navy-dark transition-colors shadow-lg text-[13px] sm:text-base"
              >
                Open a Business Account
                <ChevronRight size={18} />
              </Link>

              {/* Both images stay on purpose (founder: people are visual
                  learners). The shop owner is the human note under the copy,
                  the app screen sits opposite in the other column. */}
              {img.img_business_owner && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.img_business_owner} alt="Nigerian business owner preparing orders"
                  className="mt-8 w-full rounded-card object-cover max-h-64" loading="lazy" />
              )}
            </div></Reveal>

            {/* Right: the business app itself. The six features moved into
                the copy column, so this is the screen alone. Both images are
                deliberately kept (founder: people are visual learners): the
                shop owner under the copy, the app screen here. */}
            <Reveal delay={120}><div>
            <AppScreenshot
              screen="businessDashboard"
              alt="The Seirs business app dashboard"
            />
            </div></Reveal>
          </div>
        </div>
      </section>

      {/* ── WHAT NIGERIA MOVES: the storytelling mosaic (founder
          2026-08-11). Every tile is a REAL service category from the
          app's catalogue: farmers, traders, tailors, carpenters, and
          everything in between. Nothing international: we move Nigeria. */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-14">
              <p className="section-label mb-3">Every Trade, Every Street</p>
              <h2 className="section-title mb-4">What Nigeria moves, we move</h2>
              <p className="section-sub max-w-2xl mx-auto">
                These are not stock categories: every one of them is a real option in the
                app, priced on its own rate card, handled its own way.
              </p>
            </div>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { slot: img.img_move_farm,        title: "Farm produce",       story: "Mile 12 baskets, still fresh at the door",   slug: "moving-farm-produce" },
              { slot: img.img_move_trader,      title: "Market traders",     story: "Balogun stalls shipping city-wide",           slug: "moving-market-traders" },
              { slot: img.img_move_tailor,      title: "Tailors & fashion",  story: "Aso-ebi delivered before the party",          slug: "moving-tailors-fashion" },
              { slot: img.img_move_wood,        title: "Furniture & wood",   story: "From the sawmill bench to the new flat",      slug: "moving-furniture-woodwork" },
              { slot: img.img_move_food,        title: "Hot food",           story: "Amala that arrives still steaming",           slug: "moving-hot-food" },
              { slot: img.img_move_medical,     title: "Medical supplies",   story: "Prescriptions that cannot wait",              slug: "moving-medical-supplies" },
              { slot: img.img_move_electronics, title: "Electronics",        story: "Phones and laptops, handled like eggs",       slug: "moving-electronics" },
              { slot: img.img_move_documents,   title: "Documents",          story: "Signed contracts across town in an hour",     slug: "moving-documents" },
              { slot: img.img_move_building,    title: "Building materials", story: "Cement and cable straight to site",           slug: "moving-building-materials" },
              { slot: img.img_move_animals,     title: "Live animals",       story: "Yes: even the Christmas chicken",             slug: "moving-live-animals" },
            ].map((t, i) => (
              <Reveal key={t.title} delay={(i % 5) * 90}>
                <Link href={`/news/${t.slug}`} className="lift group relative rounded-card overflow-hidden bg-navy aspect-[4/5] block focus-visible:ring-2 focus-visible:ring-sky">
                  {t.slot && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.slot} alt={t.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-60 group-hover:scale-105 transition-all duration-500" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="w-8 h-1 bg-[#FFBE0B] rounded-full mb-2" />
                    <h3 className="text-white font-bold text-sm leading-tight">{t.title}</h3>
                    <p className="text-white/70 text-xs leading-snug mt-1">{t.story}</p>
                    <p className="text-[#FFBE0B] text-[11px] font-semibold mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Read the story</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
          <p className="text-center text-text-muted text-sm mt-8">
            Each tile opens the real story: the situation, the waste, and how we&apos;re
            helping. All of it lives in the newsroom and is editable by the team.
          </p>
        </div>
      </section>

      {/* ── THE APPS, FOR REAL: actual screenshots off the actual phone,
          in CSS device frames. No mockups, no fakes. ── */}
      <section className="py-24 bg-off-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-14">
              <p className="section-label mb-3">Straight From the Phone</p>
              <h2 className="section-title mb-4">The apps, exactly as they are</h2>
              <p className="section-sub max-w-2xl mx-auto">
                These are real screenshots from the live driver app: not mockups. The
                customer and business apps join them here as their screens are captured.
              </p>
            </div>
          </Reveal>
          <div className="flex flex-wrap items-end justify-center gap-8">
            {/* Founder privacy rule 2026-08-11: never real accounts on
                marketing surfaces (the profile shot showed a real name
                + the SEIRS ID is a collection credential). Demo-account
                captures in light + dark replace these next session. */}
            {[
              { src: "/app-shots/driver-earnings.png", label: "Earnings, transparent", lift: "lg:translate-y-4" },
              { src: "/app-shots/driver-home.png",     label: "The driver hub",        lift: "" },
            ].map((p, i) => (
              <Reveal key={p.src} delay={i * 140}>
                <div className={`flex flex-col items-center gap-3 ${p.lift}`}>
                  <div className="rounded-[2rem] border-[6px] border-navy bg-navy shadow-2xl overflow-hidden w-[220px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.label} className="w-full h-auto block" loading="lazy" />
                  </div>
                  <span className="text-text-muted text-xs font-semibold">{p.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRACKING + ESCROW: the trust story ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="section-label mb-3">Built on Proof</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-navy leading-tight mb-6">
                Every package watched.
                <br />Every naira protected.
              </h2>
              <p className="text-text-muted text-lg leading-relaxed mb-6">
                From the moment a driver accepts your booking, the package writes its own
                diary: accepted, picked up, en route, delivered, each step logged with time
                and place on a timeline anyone with the tracking code can follow.
              </p>
              <p className="text-text-muted text-base leading-relaxed mb-6">
                Your money is protected the same way. Payment sits in escrow while the
                package travels, and the driver is paid only when delivery is confirmed:
                with a proof photo, and for high-value packages, an identity-verified
                handoff. If a delivery fails, the escrow returns to you.
              </p>
              <ul className="space-y-3">
                {[
                  "Live GPS position and honest arrival estimates: never promises",
                  "Proof photo required on every single delivery",
                  "High-value packages: recipient must be ID-verified before handover",
                  "Failed or cancelled? Escrow refunds automatically",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle size={18} className="text-success-green flex-shrink-0 mt-0.5" />
                    <span className="text-text-dark text-sm leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative rounded-card overflow-hidden bg-navy min-h-[320px] flex items-end"
              style={img.img_lagos_dusk ? { backgroundImage: `url(${img.img_lagos_dusk})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
              <div className="absolute inset-0 bg-navy/50" />
              <div className="relative p-8">
                <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-2">On the timeline</p>
                <div className="space-y-2.5">
                  {[
                    { label: "Driver assigned", time: "2:14 PM", done: true },
                    { label: "Package picked up", time: "2:31 PM", done: true },
                    { label: "En route: Ikeja to Yaba", time: "2:38 PM", done: true },
                    { label: "Delivered: proof photo saved", time: "3:05 PM", done: true },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2.5">
                      <CheckCircle size={15} className="text-[#FFBE0B] flex-shrink-0" />
                      <span className="text-white text-sm flex-1">{s.label}</span>
                      <span className="text-white/50 text-xs">{s.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── NIGHT OPS ── */}
      <section className="relative py-28 overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0A1E36, #0F2B4C)" }}>
        {img.img_night_rider && (
          <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url(${img.img_night_rider})` }} />
        )}
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[#FFBE0B] font-semibold text-sm tracking-widest uppercase mb-4">Day and Night</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">
            Lagos doesn&apos;t sleep.
            <br />Neither does SEIRS.
          </h2>
          <p className="text-white/70 text-lg leading-relaxed max-w-2xl mx-auto mb-8">
            Book a pickup for 2 AM and it happens at 2 AM. Deliveries run round the clock,
            because markets open before dawn and interstate roads belong to the night.
            Night pickups carry a small night fee, and every naira of it goes to the rider
            who showed up while the city slept.
          </p>
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-5 py-2">
            <div className="w-2 h-2 bg-[#FFBE0B] rounded-full" />
            <span className="text-white/80 text-sm">Riders choose their own hours: nobody is ever forced onto the road</span>
          </div>
        </div>
      </section>

      {/* ── RECEIVER SYSTEM ── */}
      <section className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Made for Nigeria</p>
            <h2 className="section-title mb-4">Anyone you trust can collect</h2>
            <p className="section-sub max-w-2xl mx-auto">
              Your neighbour signs for packages. Security collects at the gate. Your cousin
              is home when you are not. SEIRS is built for how Nigerians actually receive
              things, safely.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <PartnerBenefit
              icon={Users}
              title="Name Your Receiver"
              description="Tell us who is collecting when you book: any first and last name you trust. The driver confirms the name at the door, no app needed on their side."
            />
            <PartnerBenefit
              icon={Shield}
              title="Codes You Control"
              description="For extra security the collection code emails YOU, and you forward it to whoever is picking up. No code, no package."
            />
            <PartnerBenefit
              icon={MapPin}
              title="Your Fallback, Your Rules"
              description="Nobody home? You chose the plan at booking: hand-to-receiver only, a named neighbour, the gate with photo proof, or a partner store nearby."
            />
          </div>
        </div>
      </section>

      {/* ── PARTNER STORES ── */}
      <section id="partner-stores" className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Store Partnerships</p>
            <h2 className="section-title mb-4">Turn Your Store Into a Pickup Point</h2>
            <p className="section-sub mb-4">
              Earn on every package your store receives, holds, or releases: with
              transparent per-package statements inside the app.
            </p>
            <p className="text-text-muted text-base max-w-xl mx-auto">
              Perfect for pharmacies, convenience stores, supermarkets, and any retail business that wants to earn extra revenue without adding extra work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-14">
            <PartnerBenefit
              icon={DollarSign}
              title="Extra Income"
              description="A per-package fee on everything you handle, plus storage fees when senders overstay. Foot traffic comes free: every collection walks a new customer into your shop."
            />
            <PartnerBenefit
              icon={Users}
              title="No Extra Staff Needed"
              description="Our scanning app is dead simple. Any existing staff member can be trained in under 10 minutes. No dedicated resource required."
            />
            <PartnerBenefit
              icon={Smartphone}
              title="Simple Scanning App"
              description="Scan barcodes to accept and release packages. The app handles everything, notifications, customer verification, payout records."
            />
          </div>

          {/* How partner stores work */}
          <div className="bg-white rounded-card p-8 shadow-sm border border-gray-100 max-w-3xl mx-auto">
            <h3 className="text-navy font-bold text-lg mb-6 text-center">
              How it works for partner stores
            </h3>
            <div className="space-y-4">
              {[
                {
                  step: "1",
                  title: "A package arrives at your store",
                  desc: "A Seirs driver drops off a package intended for a customer in your area.",
                },
                {
                  step: "2",
                  title: "Customer is notified",
                  desc: "The customer receives a push notification and collection code. They pick it up at their convenience.",
                },
                {
                  step: "3",
                  title: "You verify and release",
                  desc: "Check the collector's code or ID in the app, snap the handoff, done. The whole exchange takes under a minute.",
                },
                {
                  step: "4",
                  title: "Every package on your statement",
                  desc: "Your earnings ledger lives in the app: every package, every fee, itemised. No chasing anyone for what you're owed.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4 items-start">
                  <div className="w-8 h-8 bg-sky/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sky font-bold text-sm">{item.step}</span>
                  </div>
                  <div>
                    <div className="text-navy font-semibold text-sm">{item.title}</div>
                    <div className="text-text-muted text-sm mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-sky text-white font-bold px-8 py-4 rounded-btn hover:opacity-90 transition-opacity"
              >
                Apply as Partner Store
                <ChevronRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE SEIRS STANDARD ──
          Replaces the invented testimonials (fabricated people on a
          pre-launch site would be exactly the "cheap" tell we're
          killing). Real customer stories take this slot after launch. */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Our Promises</p>
            <h2 className="section-title mb-4">The SEIRS Standard</h2>
            <p className="section-sub max-w-2xl mx-auto">
              We are new, and we would rather earn your trust than borrow it. These are the
              rules we hold ourselves to on every single delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "No fake promises",
                body: "We never guarantee arrival times: this is Lagos, and anyone who promises you 4:15 PM is lying. We show you the live position and an honest estimate instead.",
              },
              {
                title: "Proof over trust",
                body: "Photo on every delivery. ID checks on everything valuable. A timeline you can audit. When something goes wrong, the record already exists.",
              },
              {
                title: "Fair to the people who carry it",
                body: "Riders keep the majority of every fare, night fees go to them in full, and nobody is ranked, punished, or pushed to ride when they don't want to.",
              },
            ].map((p) => (
              <div key={p.title} className="bg-off-white rounded-card p-8 border border-gray-100">
                <div className="w-10 h-1.5 bg-[#FFBE0B] rounded-full mb-5" />
                <h3 className="text-navy font-bold text-lg mb-3">{p.title}</h3>
                <p className="text-text-muted text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section
        className="relative py-20 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0F2B4C, #1a3a5c)" }}
      >
        {img.img_handoff_hands && (
          <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${img.img_handoff_hands})` }} />
        )}
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-3 lg:mb-4">
            Ready to simplify your logistics?
          </h2>
          <p className="text-white/65 text-sm sm:text-base lg:text-lg mb-6 lg:mb-8 max-w-xl mx-auto">
            Be part of the first wave: senders, riders, and partner stores building
            Nigeria&apos;s most honest delivery network.
          </p>
          {/* These were two adjacent buttons pointing at the same /contact
              URL, which teaches people that buttons are decorative. They now
              go to genuinely different places: the app for a sender, the form
              for a business. Sizing matches the hero, side by side on a
              phone rather than two stacked full-bleed blocks. */}
          <div className="flex flex-row gap-2 sm:gap-4 justify-center">
            <GetAppButton
              app="customer"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 bg-white text-navy font-bold px-3 py-3 sm:px-8 sm:py-4 rounded-btn hover:bg-gray-50 transition-colors shadow-xl text-[13px] sm:text-base"
            >
              Get the App
              <ArrowRight size={16} className="flex-shrink-0" />
            </GetAppButton>
            <Link
              href="/contact"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-3 py-3 sm:px-8 sm:py-4 rounded-btn hover:bg-white/10 transition-colors text-[13px] sm:text-base"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      {/* ── TRUST BADGES ── */}
      <section className="py-10 bg-off-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {[
              { icon: Shield, label: "NDPR Compliant" },
              { icon: CheckCircle, label: "Payments by Flutterwave" },
              { icon: Star, label: "Escrow-Protected Deliveries" },
              { icon: BarChart3, label: "ID-Verified Drivers" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-text-muted"
              >
                <Icon size={18} className="text-sky" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
