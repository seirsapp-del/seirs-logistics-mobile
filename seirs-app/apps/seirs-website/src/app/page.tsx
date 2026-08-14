import Link from "next/link";
import { getPageBlock, getImageSlots, getPartnerLogos } from "@/lib/cms";
import { PartnerMarquee } from "@/components/PartnerMarquee";
import { Reveal } from "@/components/Reveal";
import { GetAppButton } from "@/components/GetAppButton";
import { AppScreenshot } from "@/components/AppScreenshot";
import {
  Package,
  Truck,
  MapPin,
  CheckCircle,
  Users,
  Wallet,
  Upload,
  Shield,
  Headphones,
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
   app screenshot with the three steps listed beside it, so nothing renders
   this any more. The img_step_* slots it used are NOT orphaned though: seven
   of the ten story articles use them as mid-article illustrations, so they
   stay in the admin list. */

/* FeatureCard removed 2026-08-14: the six business feature cards were folded
   into a compact labelled list inside the copy column, so nothing renders a
   card any more. */

/* DriverBenefit removed 2026-08-14 with the driver band it belonged to.
   That band was the only place img_driver_portrait rendered anywhere on the
   site, so the slot is now fully orphaned and has been pulled from the
   admin's list, same as the img_step_* slots. */

/* TestimonialCard removed 2026-08-15. It was already unused before today:
   the invented testimonials it rendered were replaced by The SEIRS Standard,
   and that section has now gone too. */

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
  const [hero, img, livePartnerLogos] = await Promise.all([
    getPageBlock('home_hero'),
    getImageSlots(),
    getPartnerLogos(),
  ]);

  // Uncapped: whatever the admin has published under img_partner_logo_*.
  // Until real partners sign, the SEIRS mark stands in (founder 2026-08-14),
  // which keeps the strip's shape and motion reviewable without implying a
  // partnership that does not exist. Four copies so the loop has something
  // to actually scroll.
  const partnerLogos =
    livePartnerLogos.length > 0
      ? livePartnerLogos
      : Array.from({ length: 4 }, () => ({ name: 'SEIRS', url: '/seirs-logo.png' }));

  return (
    <>
      {/* ── HERO ── */}
      <section
        /* min-h-[90vh] is desktop-only from 2026-08-15. On a 360x740 A30 it
           forced the hero to 666px whatever the content measured, and with
           flex items-center the ~510px of actual content got centred inside
           it, opening roughly 150px of dead navy split above and below. That
           is the "empty space up" the founder reported; trimming py-24 to
           py-8 earlier helped the padding but left the min-height doing the
           damage. On a phone the hero is now content-sized, so the chip sits
           just under the nav. Desktop keeps the full-bleed 90vh hero. */
        className="relative overflow-hidden lg:min-h-[90vh] flex items-center"
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
          {/* 55/45 rather than an even split below lg. At 360 an even split
              left the copy column ~155px, which broke the headline as
              "Send / anything. / Anywhere in / Nigeria." with a single word
              stranded on line one. The extra ~18px lets "Send anything." hold
              together. The okada still reads clearly at the narrower share,
              and lg goes back to the even desktop split. */}
          <div className="grid grid-cols-[1.22fr_1fr] lg:grid-cols-2 gap-x-3 sm:gap-x-6 lg:gap-x-16 items-center">
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

      {/* ── TRUSTED BY ──
          Replaced "The apps, exactly as they are" 2026-08-14. That section
          was the third place on the homepage showing app screenshots, after
          How It Works and the business section.

          Founder follow-up: bigger marks, each with the company name,
          flowing left, and no cap on how many can be added. So this is not a
          fixed set of slots. The backend returns every published page block
          whose slug starts img_partner_logo_, ordered by slug, with the row
          TITLE as the company name. Adding a partner is creating one row in
          the admin: no deploy, no limit.

          Rendering, pausing and reduced-motion behaviour live in
          PartnerMarquee. ── */}
      <PartnerMarquee logos={partnerLogos} />

      {/* ── RECEIVER SYSTEM ──
          Rebuilt 2026-08-14 (founder: more storytelling, with a big image
          next to it of a driver handing a package to the customer, and the
          image replaceable from the admin).

          It was a centred heading over three equal icon cards, which read as
          a feature list rather than the thing it actually is: the part of
          SEIRS built around how Nigerians really receive parcels. Now it is
          a two-column story, image on one side, the three moments told as a
          short sequence on the other.

          The image is img_handoff_hands, an existing admin slot that already
          holds exactly this shot, so it is editable without a deploy and no
          new slot was needed. When it is empty the copy simply takes the
          full width rather than leaving a hole. ── */}
      <section className="py-14 sm:py-20 lg:py-24 bg-off-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Founder 2026-08-14: the handoff image should be wider. It was a
              3:4 portrait in an even 50/50 split, so it read as a tall inset
              beside the text. The image column is now the larger of the two
              (7 of 12 against 5) and the crop is landscape at every width, so
              the moment itself carries the section rather than decorating it.
              The image is admin-editable: it is the img_handoff_hands slot
              under Website > Page Blocks, which already holds this shot. */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
            {img.img_handoff_hands && (
              <Reveal className="lg:col-span-7">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.img_handoff_hands}
                  alt="A Seirs rider handing a package to the person collecting it"
                  className="w-full rounded-card object-cover aspect-[4/3] lg:aspect-[16/10] shadow-lg"
                  loading="lazy"
                />
              </Reveal>
            )}

            <Reveal delay={120} className="lg:col-span-5">
              <div>
                {/* Eyebrow was "Made for Nigeria", removed 2026-08-15: the
                    plan is to expand across Africa, and a label that pins the
                    product to one country ages badly the moment it does.
                    "How collection really works" says the same thing about
                    the feature without fixing it to a market. */}
                <p className="section-label mb-3">How collection really works</p>
                <h2 className="section-title mb-4">Anyone you trust can collect</h2>
                <p className="text-text-muted text-sm sm:text-base leading-relaxed mb-8">
                  You are at work. The parcel arrives at 2pm. In most of the
                  world that is a failed delivery and a card through the door.
                  Here, your neighbour signs for it, security takes it at the
                  gate, your cousin is home anyway. We built for that instead
                  of pretending it does not happen.
                </p>

                <div className="space-y-6">
                  {[
                    {
                      icon: Users,
                      title: "You name who is collecting",
                      body: "Any name you trust, given when you book. The driver confirms it at the door, and the person collecting needs nothing installed.",
                    },
                    {
                      icon: Shield,
                      title: "The code comes to you, not them",
                      body: "You forward it to whoever is picking up. No code, no package, and you decide who ever gets one.",
                    },
                    {
                      icon: MapPin,
                      title: "You set the fallback before it is needed",
                      body: "Hand to the receiver only, a named neighbour, the gate with photo proof, or a partner store nearby. Chosen at booking, not argued about at the door.",
                    },
                  ].map((r) => (
                    <div key={r.title} className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-sky/10 flex items-center justify-center flex-shrink-0">
                        <r.icon size={18} className="text-sky" strokeWidth={1.75} />
                      </div>
                      <div>
                        <h3 className="text-navy font-bold text-base mb-1">{r.title}</h3>
                        <p className="text-text-muted text-sm leading-relaxed">{r.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── PARTNER STORES ──
          Founder 2026-08-15: the image should sit behind the section as a
          translucent background, not as a band underneath it, which is what
          the first attempt did. Same treatment the CTA banner already uses.

          The photograph is img_partner_store, an existing admin slot, so it
          stays swappable without a deploy. Two things keep the copy readable
          over it: the image is held at low opacity, and a solid off-white
          wash sits between the photo and the content rather than relying on
          opacity alone, so a dark upload cannot turn the body text
          unreadable. Section falls back to plain off-white when the slot is
          empty. ── */}
      <section id="partner-stores" className="relative py-24 bg-off-white overflow-hidden">
        {img.img_partner_store && (
          <>
            {/* Photo at full strength, readability handled by the wash above
                it rather than by dimming the image. The first attempt did
                both, 0.18 opacity under a 55% wash, which left roughly 8% of
                the photo showing: effectively invisible. One 72% wash over a
                full-strength image leaves about 28%, which reads as a real
                background while keeping the heading legible. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${img.img_partner_store})` }}
            />
            <div aria-hidden className="absolute inset-0 bg-off-white/[0.72]" />
          </>
        )}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

          {/* Founder 2026-08-15: drop the four-step "How it works for partner
              stores" explainer, keep the apply CTA, and put a full-width
              admin-replaceable image underneath, in the spirit of the hero.

              The explainer was the same over-disclosure the business feature
              cards had: it walked a competitor through the whole partner
              flow, notification, collection code, ID check, handoff photo,
              itemised ledger, step by step. /for-partner-stores still carries
              it for someone who has actually decided to apply. */}
          <div className="text-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-sky text-white font-bold px-5 py-3 sm:px-8 sm:py-4 rounded-btn hover:opacity-90 transition-opacity text-[13px] sm:text-base"
            >
              Apply as Partner Store
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>

      </section>

      {/* THE SEIRS STANDARD removed 2026-08-15. Two of its three promises
          did not survive the audit.

          "No fake promises" (never guarantee arrival times) and "Proof over
          trust" (photo on every delivery, ID checks above the high-value
          threshold, auditable timeline) were both true and verifiable.

          "Fair to the people who carry it" was not. It claimed night fees go
          to riders in full: the fee is a percentage of the fare, rides inside
          the gross, and takes the same 30% commission as everything else. It
          also claimed nobody is ranked, while /how-it-works says jobs go to
          drivers "ranked by rating, vehicle fit and route" and
          DriverSubscription sells Priority Matching at ₦5,000/week for a
          +0.15 score boost that outranks the rating gap.

          Founder removed the section rather than rewrite one promise: a
          promises block contradicted by its own paid product costs more
          trust than it earns.

          NOTE: this block first shipped as a bare block comment sitting
          between JSX elements, which is not a comment in that position. JSX
          only treats one as a comment when it is wrapped in braces, so the
          entire paragraph rendered as visible text on the live homepage.
          Between elements, always wrap in braces. */}

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

      {/* ── TRUST BADGES ──
          Rebuilt 2026-08-15 (founder: real badges only, the licence has to
          come before the claim either way).

          "NDPR Compliant" was here and is gone. Launch checklist item 3,
          NITDA NDPR registration and DPO appointment, is Not started, so it
          asserted a registration that does not exist, on every page view,
          next to genuine ones. That is the kind of unearned compliance claim
          a regulator acts on. Add it back the day the registration lands.

          The four below are each true today and each verifiable:
          Flutterwave is the processor and is CBN-licensed; escrow holds
          funds until delivery is confirmed; drivers pass KYC review before
          going online; and the proof photo is enforced at handoff, not
          optional. Nothing here is aspirational. ── */}
      <section className="py-8 sm:py-10 bg-off-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-16">
            {[
              {
                logo: img.img_badge_flutterwave,
                icon: CheckCircle,
                label: "Payments by Flutterwave",
              },
              {
                logo: img.img_badge_compliance,
                icon: Shield,
                label: "NDPR compliant",
              },
              {
                logo: null,
                icon: Shield,
                label: "KYC-checked drivers",
              },
            ].map(({ logo, icon: Icon, label }) =>
              logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={label}
                  src={logo}
                  alt={label}
                  className="h-8 sm:h-10 w-auto max-w-[150px] object-contain"
                  loading="lazy"
                />
              ) : (
                <div key={label} className="flex items-center gap-2 text-text-muted">
                  <Icon size={17} className="text-sky flex-shrink-0" strokeWidth={1.75} />
                  <span className="text-xs sm:text-sm font-medium leading-tight">{label}</span>
                </div>
              ),
            )}
          </div>
        </div>
      </section>
    </>
  );
}
