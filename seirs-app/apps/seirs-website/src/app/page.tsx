import Link from "next/link";
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
} from "lucide-react";

/* ── Hero geometric illustration ── */
function HeroIllustration() {
  return (
    <div className="relative w-full h-full min-h-[340px] flex items-center justify-center">
      {/* Central delivery icon backdrop */}
      <div className="relative z-10">
        {/* Main package shape */}
        <div className="animate-float">
          <svg width="220" height="200" viewBox="0 0 220 200" fill="none">
            {/* Delivery truck body */}
            <rect x="20" y="80" width="140" height="80" rx="8" fill="white" fillOpacity="0.15" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" />
            {/* Truck cab */}
            <rect x="140" y="100" width="55" height="60" rx="6" fill="white" fillOpacity="0.15" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" />
            {/* Windshield */}
            <rect x="148" y="108" width="35" height="24" rx="3" fill="white" fillOpacity="0.25" />
            {/* Wheels */}
            <circle cx="55" cy="165" r="16" fill="white" fillOpacity="0.2" stroke="white" strokeOpacity="0.4" strokeWidth="2" />
            <circle cx="55" cy="165" r="8" fill="white" fillOpacity="0.3" />
            <circle cx="155" cy="165" r="16" fill="white" fillOpacity="0.2" stroke="white" strokeOpacity="0.4" strokeWidth="2" />
            <circle cx="155" cy="165" r="8" fill="white" fillOpacity="0.3" />
            {/* Package on truck */}
            <rect x="45" y="90" width="50" height="50" rx="4" fill="white" fillOpacity="0.25" stroke="white" strokeOpacity="0.5" strokeWidth="1.5" />
            <line x1="70" y1="90" x2="70" y2="140" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
            <line x1="45" y1="115" x2="95" y2="115" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" />
            {/* Signal / tracking dots */}
            <circle cx="185" cy="70" r="5" fill="#3A7BD5" />
            <circle cx="185" cy="70" r="10" fill="#3A7BD5" fillOpacity="0.3" />
            <circle cx="185" cy="70" r="16" fill="#3A7BD5" fillOpacity="0.15" />
          </svg>
        </div>
      </div>

      {/* Floating location pins */}
      <div className="absolute top-6 left-8 animate-float-reverse">
        <div className="bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl p-3 flex items-center gap-2">
          <div className="w-6 h-6 bg-sky rounded-full flex items-center justify-center flex-shrink-0">
            <MapPin size={12} className="text-white" />
          </div>
          <div>
            <div className="text-white text-xs font-semibold">Lagos Island</div>
            <div className="text-white/60 text-[10px]">Pickup point</div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 right-6 animate-float" style={{ animationDelay: "2s" }}>
        <div className="bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl p-3 flex items-center gap-2">
          <div className="w-6 h-6 bg-success-green rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircle size={12} className="text-white" />
          </div>
          <div>
            <div className="text-white text-xs font-semibold">Delivered</div>
            <div className="text-white/60 text-[10px]">Lekki Phase 1</div>
          </div>
        </div>
      </div>

      <div className="absolute top-1/3 right-2 animate-pulse-slow">
        <div className="bg-warning-amber/30 border border-warning-amber/50 rounded-xl p-2.5 flex items-center gap-2">
          <Truck size={14} className="text-warning-amber" />
          <div className="text-white text-xs font-semibold">En route</div>
        </div>
      </div>

      {/* Abstract geometric circles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div className="absolute -top-10 -right-10 w-48 h-48 border border-white/10 rounded-full" />
        <div className="absolute -top-20 -right-20 w-72 h-72 border border-white/5 rounded-full" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 border border-white/8 rounded-full" />
      </div>
    </div>
  );
}

/* ── Step Card ── */
function StepCard({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="relative bg-white rounded-card p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
      <div className="absolute -top-4 -left-2">
        <div className="w-8 h-8 bg-navy text-white font-black text-sm rounded-lg flex items-center justify-center shadow-lg">
          {number}
        </div>
      </div>
      <div className="w-14 h-14 bg-sky/10 rounded-xl flex items-center justify-center mb-5">
        <Icon size={26} className="text-sky" />
      </div>
      <h3 className="text-navy font-bold text-lg mb-2">{title}</h3>
      <p className="text-text-muted text-sm leading-relaxed">{description}</p>
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
    <div className="flex items-start gap-4 p-5 bg-off-white rounded-card hover:bg-gray-50 transition-colors duration-150">
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
    <div className="flex flex-col items-center text-center p-6 bg-white rounded-card shadow-sm border border-gray-100">
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
export default function HomePage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="relative overflow-hidden min-h-[90vh] flex items-center"
        style={{
          background: "linear-gradient(135deg, #0F2B4C 0%, #1a3a5c 60%, #0F2B4C 100%)",
        }}
      >
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
                <div className="w-2 h-2 bg-success-green rounded-full animate-pulse" />
                <span className="text-white/80 text-xs font-medium">
                  Now live across Lagos & Abuja
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight">
                Nigeria&apos;s Smartest
                <br />
                <span className="text-sky">Last-Mile Delivery</span>
                <br />
                Platform
              </h1>

              <p className="text-white/70 text-lg leading-relaxed mb-8 max-w-lg">
                Send thousands of packages with one click. Real-time tracking,
                business wallets, and a network of verified drivers and partner
                stores across Nigeria.
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

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { value: "10,000+", label: "Deliveries" },
                  { value: "500+", label: "Drivers" },
                  { value: "200+", label: "Partner Stores" },
                  { value: "99.2%", label: "On-Time Rate" },
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

            {/* Right: illustration */}
            <div className="hidden lg:block">
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
              From order creation to doorstep delivery — Seirs makes logistics effortless.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
            <StepCard
              number={1}
              title="Create a Delivery"
              description="Add your pickup and drop-off address, describe your package, and pay instantly from your Seirs wallet. Bulk orders? Upload a CSV and process hundreds at once."
              icon={Package}
            />
            <StepCard
              number={2}
              title="Driver Picks Up"
              description="A verified, background-checked driver is automatically assigned and dispatched to your pickup location in minutes. You get their name, photo, and live location."
              icon={Truck}
            />
            <StepCard
              number={3}
              title="Real-Time Tracking"
              description="Track every step of the journey on the map in real time. Get push notifications at each milestone — dispatched, picked up, nearby, delivered."
              icon={MapPin}
            />
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
            <div>
              <p className="section-label mb-3">Business Accounts</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-navy leading-tight mb-4">
                Built for Nigerian Businesses
              </h2>
              <p className="text-text-muted text-lg leading-relaxed mb-8">
                Whether you ship 10 parcels a day or 10,000 a month, Seirs scales with you. Manage your entire logistics operation from one dashboard — no spreadsheets, no chasing drivers.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-navy text-white font-bold px-8 py-4 rounded-btn hover:bg-navy-dark transition-colors shadow-lg"
              >
                Open a Business Account
                <ChevronRight size={18} />
              </Link>

              {/* Social proof */}
              <div className="mt-8 p-5 bg-off-white rounded-card border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-success-green" />
                  <span className="text-navy font-semibold text-sm">
                    Trusted by Nigerian businesses
                  </span>
                </div>
                <p className="text-text-muted text-sm">
                  E-commerce brands, FMCG distributors, pharmacies, and fashion retailers use Seirs to power their last-mile delivery.
                </p>
              </div>
            </div>

            {/* Right: feature grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FeatureCard
                icon={Upload}
                title="Bulk CSV Upload"
                description="Upload hundreds of delivery orders in one go with our simple CSV template. Save hours every morning."
              />
              <FeatureCard
                icon={Wallet}
                title="Business Wallet"
                description="Top up once, dispatch all day. Your wallet is instantly debited per delivery — no per-transaction friction."
              />
              <FeatureCard
                icon={Users}
                title="Team Management"
                description="Add multiple team members to your account with customisable roles and spending limits."
              />
              <FeatureCard
                icon={Gift}
                title="Loyalty Rewards"
                description="Earn ₦10 per point on every delivery. Redeem points against future orders — the more you send, the more you save."
              />
              <FeatureCard
                icon={Zap}
                title="API Access"
                description="Plug Seirs directly into your e-commerce platform, ERP, or custom backend via our REST API."
              />
              <FeatureCard
                icon={Headphones}
                title="Dedicated Support"
                description="Business accounts get a dedicated account manager and priority support with a 2-hour response SLA."
              />
            </div>
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
            <p className="text-sky font-semibold text-sm tracking-widest uppercase mb-3">
              Driver Opportunities
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
              Earn on Your Schedule
            </h2>
            <p className="text-white/65 text-lg max-w-2xl mx-auto">
              Join over 500 verified drivers across Nigeria who use Seirs to build a flexible, rewarding income. You set your hours — we bring the deliveries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-16">
            <DriverBenefit
              icon={DollarSign}
              title="Weekly Payouts"
              description="Your earnings are calculated and paid out every Monday, directly to your Nigerian bank account. No delays, no excuses."
            />
            <DriverBenefit
              icon={Truck}
              title="Vehicle Flexibility"
              description="Ride a motorcycle, drive a car, or operate a truck. Seirs supports all vehicle types — earn more with larger vehicles."
            />
            <DriverBenefit
              icon={Smartphone}
              title="In-App Earnings Tracking"
              description="See your earnings, completed deliveries, and rating in real time. Full transparency, always."
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

      {/* ── PARTNER STORES ── */}
      <section id="partner-stores" className="py-24 bg-off-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Store Partnerships</p>
            <h2 className="section-title mb-4">Turn Your Store Into a Pickup Point</h2>
            <p className="section-sub mb-4">
              Earn{" "}
              <span className="font-bold text-navy">&#8358;500 per package collected</span>.
              Accept packages on behalf of customers and get paid every Monday.
            </p>
            <p className="text-text-muted text-base max-w-xl mx-auto">
              Perfect for pharmacies, convenience stores, supermarkets, and any retail business that wants to earn extra revenue without adding extra work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-14">
            <PartnerBenefit
              icon={DollarSign}
              title="Extra Income"
              description="Earn ₦500 per successfully collected package. High-volume partner stores earn ₦40,000+ per month in passive income on top of their regular sales."
            />
            <PartnerBenefit
              icon={Users}
              title="No Extra Staff Needed"
              description="Our scanning app is dead simple. Any existing staff member can be trained in under 10 minutes. No dedicated resource required."
            />
            <PartnerBenefit
              icon={Smartphone}
              title="Simple Scanning App"
              description="Scan barcodes to accept and release packages. The app handles everything — notifications, customer verification, payout records."
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
                  title: "You scan and release",
                  desc: "Scan the customer's QR code to confirm collection. ₦500 is credited to your store account instantly.",
                },
                {
                  step: "4",
                  title: "Weekly payout to your bank",
                  desc: "Every Monday, your accumulated balance is transferred directly to your linked bank account.",
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

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="section-label mb-3">Real Stories</p>
            <h2 className="section-title mb-4">What Our Users Say</h2>
            <p className="section-sub">
              Thousands of Nigerians rely on Seirs every day. Here&apos;s what some of them think.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="We used to spend 3 hours every morning booking deliveries one by one. With Seirs, we upload our CSV and everything is dispatched in 15 minutes. Our team actually shows up to work happy now."
              name="Adaeze Okafor"
              role="Operations Manager, Fashion Retailer"
              location="Lagos"
              rating={5}
            />
            <TestimonialCard
              quote="I drive for Seirs after my regular job on Tuesdays and Saturdays. Last month I made ₦67,000 extra. The app is clean, the payouts are always on time Monday morning — I don't even have to chase anybody."
              name="Emeka Nwosu"
              role="Part-time Driver"
              location="Ikeja, Lagos"
              rating={5}
            />
            <TestimonialCard
              quote="I travel a lot and I used to miss deliveries. Now the package goes to the pharmacy two streets from my house and I collect it whenever I'm ready. The scanning takes literally 5 seconds. Brilliant idea."
              name="Fatima Sule"
              role="Customer"
              location="Abuja"
              rating={5}
            />
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section
        className="py-20"
        style={{ background: "linear-gradient(135deg, #0F2B4C, #1a3a5c)" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Ready to simplify your logistics?
          </h2>
          <p className="text-white/65 text-lg mb-8 max-w-xl mx-auto">
            Join thousands of Nigerian businesses and individuals who trust Seirs for fast, reliable last-mile delivery.
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
              { icon: CheckCircle, label: "CBN Payment Partner" },
              { icon: Star, label: "4.9★ Average Rating" },
              { icon: BarChart3, label: "99.2% On-Time Rate" },
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
