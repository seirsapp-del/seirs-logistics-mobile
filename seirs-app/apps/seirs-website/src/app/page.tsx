import Link from "next/link";
import { getPageBlock, getImageSlots } from "@/lib/cms";
import { Reveal } from "@/components/Reveal";
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
  Clock,
  Gift,
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
    <div className="relative w-full h-full min-h-[260px] sm:min-h-[320px] lg:min-h-[380px] flex items-center justify-center">
      {/* The SVG scales to the column width (max-w-full), so on a 390px
          phone it lands at ~358px wide, roughly 0.81 of full size. The
          bold-stroke geometry survives that: 13px strokes render at
          ~10.6, the rider's head ~23px across, the wheels ~42px. min-h
          tracks the scaled height so there is no dead space under it. */}
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

/* ── Step Card. Photo slot on top when the admin has uploaded one
   (Admin > Website > Page Blocks > img_step_*); icon-only otherwise. ── */
function StepCard({
  number,
  title,
  description,
  icon: Icon,
  imageUrl,
}: {
  number: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  imageUrl?: string;
}) {
  return (
    <div className="lift relative bg-white rounded-card shadow-sm border border-gray-100 overflow-hidden">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="w-full h-44 object-cover" loading="lazy" />
      )}
      <div className="relative p-8">
        <div className="absolute -top-4 left-6">
          <div className="w-8 h-8 bg-navy text-white font-black text-sm rounded-lg flex items-center justify-center shadow-lg">
            {number}
          </div>
        </div>
        {!imageUrl && (
          <div className="w-14 h-14 bg-sky/10 rounded-xl flex items-center justify-center mb-5">
            <Icon size={26} className="text-sky" />
          </div>
        )}
        <h3 className={`text-navy font-bold text-lg mb-2 ${imageUrl ? 'mt-4' : ''}`}>{title}</h3>
        <p className="text-text-muted text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ── Business Feature Card ── */
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="lift flex items-start gap-4 p-5 bg-off-white rounded-card hover:bg-white">
      <div className="w-11 h-11 bg-navy/10 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon size={22} className="text-navy" />
      </div>
      <div>
        <h4 className="text-navy font-bold text-sm mb-1">{title}</h4>
        <p className="text-text-muted text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ── Driver Benefit Card ── */
function DriverBenefit({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-white/15 border border-white/25 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Icon size={28} className="text-white" />
      </div>
      <h4 className="text-white font-bold text-base mb-2">{title}</h4>
      <p className="text-white/65 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

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

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
                <div className="w-2 h-2 bg-[#FFBE0B] rounded-full animate-pulse" />
                <span className="text-white/80 text-xs font-medium">
                  Launching in Lagos: join the first wave
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight">
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

              <p className="text-white/70 text-lg leading-relaxed mb-8 max-w-lg">
                {hero?.excerpt ??
                  'Send thousands of packages with one click. Real-time tracking, business wallets, and a network of verified drivers and partner stores across Nigeria.'}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-14">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 bg-white text-navy font-bold px-8 py-4 rounded-btn hover:bg-gray-50 transition-colors shadow-xl text-base"
                >
                  Start Sending
                  <ArrowRight size={18} />
                </Link>
                <Link
                  href="/for-drivers"
                  className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-8 py-4 rounded-btn hover:bg-white/10 transition-colors text-base"
                >
                  Become a Driver
                </Link>
              </div>

              {/* Honesty pass 2026-08-12: the old banner implied the SITE
                  ships in four languages. Truth: the APPS carry Yoruba /
                  Igbo / Hausa translations (improving, see the language
                  story), and this site is English with browser
                  translation. Say exactly that. */}
              <Link
                href="/news/speaking-nigerian-languages"
                className="inline-flex items-center gap-2.5 bg-white/5 border border-white/15 rounded-lg px-3 py-2 mb-8 hover:bg-white/10 transition-colors"
              >
                <Globe size={14} className="text-[#FFBE0B] flex-shrink-0" strokeWidth={1.75} />
                <span className="text-white/65 text-xs">
                  The apps speak Yoruba, Igbo and Hausa. Read how we&apos;re improving that
                </span>
              </Link>

              {/* Value props, not vanity metrics. Honesty rule 2026-08-11:
                  the old fake stats (10,000+ deliveries, 99.2% on-time)
                  claimed history a pre-launch platform does not have, and
                  an on-time percentage is a promise we never make. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { value: "24/7", label: "Pickups, day & night" },
                  { value: "Live", label: "GPS tracking" },
                  { value: "Verified", label: "ID-checked drivers" },
                  { value: "Escrow", label: "Pay on delivery" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white/10 border border-white/15 rounded-card px-4 py-4 text-center"
                  >
                    <div className="text-white font-extrabold text-xl">{stat.value}</div>
                    <div className="text-white/55 text-xs mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right on desktop, below the copy on phones (founder
                2026-08-14: it renders on iPad but was hidden under lg,
                so the phone never got the okada). It sits after the
                headline and CTAs in DOM order, so showing it costs
                nothing above the fold. */}
            <div>
              <HeroIllustration />
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
            <Reveal delay={0}>
              <StepCard
                number={1}
                title="Create a Delivery"
                description="Add your pickup and drop-off address, describe your package, and pay instantly from your Seirs wallet. Bulk orders? Upload a CSV and process hundreds at once."
                icon={Package}
                imageUrl={img.img_step_book}
              />
            </Reveal>
            <Reveal delay={120}>
              <StepCard
                number={2}
                title="Driver Picks Up"
                description="A verified, background-checked driver is automatically assigned and dispatched to your pickup location in minutes. You get their name, photo, and live location."
                icon={Truck}
                imageUrl={img.img_step_pickup}
              />
            </Reveal>
            <Reveal delay={240}>
              <StepCard
                number={3}
                title="Real-Time Tracking"
                description="Track every step of the journey on the map in real time. Get push notifications at each milestone, dispatched, picked up, nearby, delivered."
                icon={MapPin}
                imageUrl={img.img_step_delivered}
              />
            </Reveal>
          </div>

          {/* Connector line (desktop) */}
          <div className="hidden md:flex items-center justify-center mt-2 -mt-4 relative" aria-hidden="true">
            {/* purely visual; the grid positions already imply flow */}
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
              <p className="text-text-muted text-base leading-relaxed mb-8">
                Every booking is priced from a transparent rate card: base fare, distance,
                weight, and any surcharges itemised line by line before you pay. Your team
                books from one shared wallet with roles and limits you control, and every
                delivery lands in a monthly statement your accountant will actually like.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-navy text-white font-bold px-8 py-4 rounded-btn hover:bg-navy-dark transition-colors shadow-lg"
              >
                Open a Business Account
                <ChevronRight size={18} />
              </Link>

              {img.img_business_owner && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.img_business_owner} alt="Nigerian business owner preparing orders"
                  className="mt-8 w-full rounded-card object-cover max-h-64" loading="lazy" />
              )}
            </div></Reveal>

            {/* Right: feature grid. Every card describes a shipped feature. */}
            <Reveal delay={120}><div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FeatureCard
                icon={Upload}
                title="Bulk CSV Upload"
                description="Upload hundreds of delivery orders in one go with our simple CSV template. Save hours every morning."
              />
              <FeatureCard
                icon={Wallet}
                title="Business Wallet"
                description="Top up once, dispatch all day. Your wallet is instantly debited per delivery, no per-transaction friction."
              />
              <FeatureCard
                icon={Users}
                title="Team Management"
                description="Add multiple team members to your account with customisable roles and spending limits."
              />
              <FeatureCard
                icon={Gift}
                title="Recurring Templates"
                description="Same route every Tuesday? Save it once and rebook it in two taps, schedule included."
              />
              <FeatureCard
                icon={Zap}
                title="Multi-Stop Runs"
                description="One pickup, many drop-offs. Route-optimised automatically, each stop with its own verification code."
              />
              <FeatureCard
                icon={Headphones}
                title="Direct Support"
                description="A real support inbox inside the app: open a ticket, get a human, keep the whole thread in one place."
              />
            </div></Reveal>
          </div>
        </div>
      </section>

      {/* ── FOR DRIVERS ── */}
      <section
        id="for-drivers"
        className="py-24"
        style={{ background: "linear-gradient(135deg, #0F2B4C, #1a3a5c)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-[#FFBE0B] font-semibold text-sm tracking-widest uppercase mb-3">
              Driver Opportunities
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
              Earn on Your Schedule
            </h2>
            <p className="text-white/65 text-lg max-w-2xl mx-auto">
              Okada, keke, car, van, or truck: you set your hours, we bring the deliveries.
              Be one of the first riders on the platform and grow with it.
            </p>
          </div>

          {img.img_driver_portrait && (
            <div className="flex justify-center mb-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.img_driver_portrait} alt="SEIRS delivery rider"
                className="rounded-card object-cover max-h-96 shadow-2xl" loading="lazy" />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-16">
            <DriverBenefit
              icon={DollarSign}
              title="Your Money, Your Timing"
              description="Every delivery credits your wallet the moment it completes. Withdraw to your Nigerian bank account whenever you want, or let the daily payout run send it automatically."
            />
            <DriverBenefit
              icon={Truck}
              title="Night Pays Extra"
              description="Deliveries run 24/7 and night pickups carry a night fee that goes to you in full. Ride when the city needs you: you decide, always."
            />
            <DriverBenefit
              icon={Smartphone}
              title="See Everything"
              description="Earnings, completed trips, ratings, and a demand map showing where the orders are, live in the app. Full transparency, always."
            />
          </div>

          {/* Requirements */}
          <div className="bg-white/10 border border-white/20 rounded-card p-8 max-w-2xl mx-auto text-center">
            <h3 className="text-white font-bold text-lg mb-4">Requirements to Join</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mb-6">
              {[
                "Valid Nigerian driving licence",
                "NIN (National ID Number)",
                "Vehicle in good working condition",
                "Android smartphone (iOS coming soon)",
                "Valid vehicle insurance",
                "Clean police report",
              ].map((req) => (
                <div key={req} className="flex items-center gap-2">
                  <CheckCircle size={15} className="text-success-green flex-shrink-0" />
                  <span className="text-white/75 text-sm">{req}</span>
                </div>
              ))}
            </div>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-sky text-white font-bold px-8 py-4 rounded-btn hover:opacity-90 transition-opacity"
            >
              Join as a Driver
              <ArrowRight size={18} />
            </Link>
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
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Ready to simplify your logistics?
          </h2>
          <p className="text-white/65 text-lg mb-8 max-w-xl mx-auto">
            Be part of the first wave: senders, riders, and partner stores building
            Nigeria&apos;s most honest delivery network.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 bg-white text-navy font-bold px-8 py-4 rounded-btn hover:bg-gray-50 transition-colors shadow-xl text-base"
            >
              Get Started Today
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white font-semibold px-8 py-4 rounded-btn hover:bg-white/10 transition-colors text-base"
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
