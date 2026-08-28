/**
 * Launch registry: every value on the public site that is a stand-in for
 * something real, in one place.
 *
 * The site is written as though SEIRS is already live. Buttons say "Get the
 * app" and go to the store, the footer offers a phone number, flows read as
 * finished products. Some of what sits behind those promises does not exist
 * yet. Rather than scattering that gap across twenty files as dead hrefs and
 * disabled buttons, every stand-in lives here.
 *
 * At launch you do not hunt through the codebase. You edit this file.
 *
 * Each entry is tagged:
 *   LIVE        already real, nothing to do
 *   PENDING     a real destination that does not resolve yet (store pages
 *               before the apps are published). Safe to ship: the link is
 *               correct, the target simply is not there until you publish.
 *   NEEDS_DATA  a value only the founder can supply. These are listed in
 *               LAUNCH_CHECKLIST at the bottom.
 */

// ── App identifiers ─────────────────────────────────────────────────────────
// Read from each app's app.json. These are final, so the store URLs built
// from them are already the correct forever-URLs. They 404 until you publish,
// which is the intended pre-launch behaviour.
export const APP_IDS = {
  customer: 'co.seirs.customer',
  driver: 'co.seirs.driver',
  business: 'co.seirs.business',
} as const;

export type AppName = keyof typeof APP_IDS;

// ── Store links ─────────────────────────────────────────────────────────────
// PENDING until the listings go live. Do not gate these behind a "coming
// soon" state: a visitor who taps "Get the app" should land on the store
// page, and on the day you publish this starts working with no code change.
export const STORE = {
  play: (app: AppName) =>
    `https://play.google.com/store/apps/details?id=${APP_IDS[app]}`,
  // NEEDS_DATA: Apple assigns the numeric id when the app is first created
  // in App Store Connect. Until then this points at a search, which is a
  // real page that returns real results rather than a broken link.
  apple: (app: AppName) =>
    APPLE_APP_IDS[app]
      ? `https://apps.apple.com/app/id${APPLE_APP_IDS[app]}`
      : `https://apps.apple.com/search?term=seirs%20${app}`,
} as const;

// NEEDS_DATA: fill each in once the app exists in App Store Connect.
export const APPLE_APP_IDS: Record<AppName, string | null> = {
  customer: null,
  driver: null,
  business: null,
};

// ── Contact ─────────────────────────────────────────────────────────────────
export const CONTACT = {
  support: 'support@seirs.co', // LIVE
  business: 'business@seirs.co', // LIVE
  legal: 'legal@seirs.co', // LIVE
  careers: 'careers@seirs.co', // LIVE

  // NEEDS_DATA. This is the statutory one. The Privacy Policy routes every
  // NDPA data-subject request (access, correction, deletion, portability,
  // objection, withdrawal of consent) to this address and promises a reply
  // within 30 days, which is a binding commitment, not marketing copy. It
  // was the only contact address on the site that was never tracked here,
  // so nobody had ever confirmed the mailbox exists. If it does not, access
  // and deletion requests bounce silently and the 30-day clock still runs.
  // Verify it delivers to a monitored inbox, then mark this LIVE. If it
  // cannot be created, repoint the policy at legal@seirs.co instead.
  privacy: 'privacy@seirs.co',

  // NEEDS_DATA. The footer used to dial +234 800 000 0000, a placeholder that
  // connected to nothing, removed 2026-08-14. In Nigeria a WhatsApp link
  // converts far better than an email form, so prefer whatsapp over phone.
  // Set whatsapp to a full international number with no punctuation, e.g.
  // '2348012345678', and the footer and contact page will render it.
  whatsapp: null as string | null,
  phone: null as string | null,
} as const;

// ── Site ────────────────────────────────────────────────────────────────────
// NEEDS_DATA: the one canonical domain.
//
// Inside THIS app it is now genuinely single-source: layout.tsx, sitemap.ts,
// robots.ts and CookieBanner all import SITE_URL, and the three hardcoded
// literals they used to carry are gone (2026-08-23).
//
// The platform-wide split is NOT fixed and cannot be fixed from here. The
// backend reads the same idea under four other names, defaulting two ways:
//   NEXT_PUBLIC_SITE_URL  this app                  -> seirs.app
//   PUBLIC_SITE_URL       deliveries, payments      -> seirs.app
//   WEBSITE_URL           mail                      -> seirs-website.vercel.app
//   PUBLIC_WEB_URL        statements                -> seirs-website.vercel.app
//   WEB_URL               one further backend read
// So today a WhatsApp collect link goes to seirs.app/collect while the
// password-reset email from the same backend goes to vercel.app/reset-password.
// Setting the Vercel env var moves this app only. Settling the domain means
// one shared constant the backend imports too (register item W-4).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://seirs.app';

// ── App screenshots ─────────────────────────────────────────────────────────
// Real captures from the running apps, used in the How it Works story and the
// app sections. null means no capture exists yet, and AppScreenshot draws a
// skeleton of that screen instead. Drop the file in public/app-shots/ and set
// the path here; nothing else changes.
export type ScreenKey =
  | 'customerBooking'
  | 'customerDriverAccepted'
  | 'customerTracking'
  | 'driverHome'
  | 'driverEarnings'
  | 'businessDashboard';

export const APP_SCREENSHOTS: Record<ScreenKey, string | null> = {
  // LIVE since the 2026-08-15 capture session: real screens off the real
  // A30, driven over adb. Booking is the ride-quote screen with both pins
  // and the Ikeja-to-UNILAG route drawn; driver-accepted shows the arrived
  // state with the driver card (name, rating, plate, vehicle); tracking is
  // the live map mid-trip. The wrong-app stand-ins are finally history.
  customerBooking: '/app-shots/customer-booking.png',
  customerDriverAccepted: '/app-shots/customer-driver.png',
  customerTracking: '/app-shots/customer-tracking.png',
  driverHome: '/app-shots/driver-home.png',
  driverEarnings: '/app-shots/driver-earnings.png',
  businessDashboard: '/app-shots/business-dashboard.png',
};

// ── Where SEIRS actually operates ───────────────────────────────────────────
// NEEDS_DATA. Empty on purpose. The contact page used to state "Operations
// currently active across Lagos and Abuja, with expansion to Port Harcourt
// and Kano underway" while APPS_PUBLISHED was false, the store listings were
// pending and the partner directory returned zero stores: nothing was active
// anywhere, in any city. Coverage copy now reads from this list and is gated
// on APPS_PUBLISHED, so it cannot reappear before there is something behind
// it. Add the real cities on the day the first one runs.
export const SERVICE_AREAS: readonly string[] = [];

// ── Launch state ────────────────────────────────────────────────────────────
// Flip to true on the day the apps are published. Anything that should read
// differently before and after launch keys off this, so the switch is one
// line rather than a sweep.
export const APPS_PUBLISHED = false;

/**
 * Everything still waiting on real data, for the launch checklist.
 * Keep this in sync when you add a stand-in.
 */
export const LAUNCH_CHECKLIST = [
  {
    key: 'WHATSAPP_PHONE_NUMBER_ID',
    what: 'WhatsApp Business phone number id from Meta',
    where: 'Railway env on the backend',
    blocks: 'Receivers are never told their package is at a counter. They have no SEIRS account, so nothing else reaches them',
    from: 'Meta Business account, after the number is registered to WhatsApp Business',
  },
  {
    key: 'WHATSAPP_ACCESS_TOKEN',
    what: 'Permanent access token for the WhatsApp Cloud API',
    where: 'Railway env on the backend',
    blocks: 'Same as above. WhatsAppService no-ops without it',
    from: 'Meta Business account, System User token',
  },
  {
    key: 'WHATSAPP_TEMPLATES',
    what: 'Approved templates named package_at_counter and collection_deadline',
    where: 'Meta Business Manager, then match the names in whatsapp.service.ts',
    blocks: 'Sends fail: a template message to someone who never messaged us first must be pre-approved',
    from: 'Meta review, usually a day or two',
  },
  {
    key: 'APPLE_APP_IDS',
    what: 'Numeric App Store ids for customer, driver and business',
    where: 'src/lib/launch.ts',
    blocks: 'iOS store links fall back to an App Store search',
    from: 'App Store Connect, once each app record exists',
  },
  {
    key: 'CONTACT.whatsapp',
    what: 'Business WhatsApp number, international format, digits only',
    where: 'src/lib/launch.ts',
    blocks: 'Footer and contact page show email only, no instant channel',
    from: 'Founder',
  },
  {
    key: 'CONTACT.phone',
    what: 'Real business phone line, if one exists',
    where: 'src/lib/launch.ts',
    blocks: 'Nothing. Optional, and WhatsApp is the better default',
    from: 'Founder',
  },
  {
    key: 'NEXT_PUBLIC_SITE_URL',
    what: 'The one canonical domain, plus the four backend names that mean the same thing: PUBLIC_SITE_URL, WEBSITE_URL, PUBLIC_WEB_URL and WEB_URL',
    where: 'Vercel env vars for this app, Railway env for the backend, and the ~20 hardcoded literals the backend still carries',
    blocks: 'Setting the Vercel var fixes this app only. Until all five agree, a WhatsApp collect link and a password-reset email from the same backend point at different domains, and the public tracking and collect-fee flows sit on the unresolved host',
    from: 'Founder, once the domain is chosen. Then export one shared constant all three apps and the backend import',
  },
  {
    key: 'APPS_PUBLISHED',
    what: 'Flip to true on launch day',
    where: 'src/lib/launch.ts',
    blocks: 'Copy that reads differently pre and post launch',
    from: 'Founder',
  },
  {
    key: 'Partner directory',
    what: 'Live partner stores in the database',
    where: 'Admin dashboard',
    blocks: 'Find a Partner shows "0 partners in the network"',
    from: 'Operations, target roughly 10 before promoting it in the nav',
  },
  {
    key: 'CONTACT.privacy',
    what: 'A monitored mailbox at privacy@seirs.co',
    where: 'Mail provider, then mark LIVE in src/lib/launch.ts',
    blocks: 'Statutory NDPA access and deletion requests bounce silently while the Privacy Policy promises a reply within 30 days',
    from: 'Founder. If the mailbox cannot exist, repoint the policy at legal@seirs.co',
  },
  {
    key: 'Partner logos',
    what: 'Real partner marks published as img_partner_logo_* page blocks, with the company name as the row title',
    where: 'Admin dashboard, Website > Page Blocks',
    blocks: 'The homepage "Trusted by" strip does not render at all. It used to repeat the SEIRS mark four times under that heading, which is the site vouching for itself, so the fallback was removed on 2026-08-23',
    from: 'Operations, as partners sign',
  },
  {
    key: 'Live city list',
    what: 'The cities SEIRS actually operates in, and the ones genuinely being opened',
    where: 'src/app/contact/page.tsx, the Our Location card',
    blocks: 'The contact page says only "Lagos, Nigeria" and names no coverage. It claimed active operations in Lagos and Abuja plus expansion to Port Harcourt and Kano while nothing was live anywhere; that claim was removed on 2026-08-23 and is gated on APPS_PUBLISHED',
    from: 'Operations, once the first city is genuinely running',
  },
  {
    key: 'REFERRAL_DEFERRED_DEEPLINK',
    what: 'Play Install Referrer / Apple attribution-token handling so a code from /r/<code> survives the install',
    where: 'Customer app + backend, not the website',
    blocks: 'Nothing today. /r/<code> saves the code to localStorage, but only the visitor\'s browser can read it, so attribution still depends on the new user typing the code into the app signup field',
    from: 'Engineering, post-launch',
  },

  /*
   * Four live values deliberately parked, confirmed against production on
   * 2026-08-28 and confirmed deliberate by the founder the same day.
   *
   * They are here rather than in a note because every one of them is a
   * number that is CORRECT to hold today and WRONG to launch with, which
   * is exactly the state this list exists to track. None is a bug and
   * none should be "fixed" by anybody reading the code: each is a
   * founder decision with a date on it.
   */
  {
    key: 'EMERGENCY_CONTACT_DIRECTORY',
    what: 'The admin-managed emergency directory the SOS screen was built against',
    where: 'Backend: GET /config/emergency-contacts does not exist. No entity, no controller, no admin page',
    blocks: 'Nothing dangerous: the SOS screen falls back to 112 (national emergency) and 199 (fire service), both correct, and both dial. But a Lagos user gets two national lines instead of LASEMA, FRSC, state police and ambulance numbers. The screen no longer shouts "we could not load the directory" at them, because that read as an outage on the one screen where a warning must mean something',
    from: 'Founder, who has to supply VERIFIED local numbers. A wrong number on this screen is the most dangerous string in the product, so nobody should invent them',
  },
  {
    key: 'driver_clearance_business_days',
    what: 'Business days a completed job waits before a rider may withdraw it. Currently 0, code default is 2',
    where: 'Fee Catalogue, Pricing page, "What a rider is paid"',
    blocks: 'Nothing today, and that is the problem at launch: a rider completes a job at 6pm and can withdraw it the same evening, so a dispute raised the next morning arrives after the money has gone. Dialled to 0 deliberately so a real payout, a failed payout and a pay-in could be watched in one sitting instead of waiting out a weekend',
    from: 'Founder, before the first real customer money moves',
  },
  {
    key: 'partner_payout_hold_hours',
    what: 'Hours a counter handling fee waits before a partner may withdraw it. Currently 0, seeded value is 168 (the weekly Monday payout)',
    where: 'Fee Catalogue, Pricing page, "Partner stores and counters"',
    blocks: 'Nothing today. At launch a shop can withdraw a handling fee the same afternoon, before anyone has confirmed the parcel arrived intact',
    from: 'Founder, before the first partner counter goes live',
  },
  {
    key: 'serviceFees.packageNgn / serviceFees.rideNgn',
    what: 'The SEIRS service fee on every booking and every ride. Both published at 0 on rate card v2',
    where: 'Rate card, Pricing page, "Service fee". Needs a PUBLISH, not a save',
    blocks: 'Nothing breaks. SEIRS simply collects no service fee at all: margin comes entirely from the customer/driver spread, about 19.5% on a sample 1,025.00 job. The lever works and is switched off',
    from: 'Founder, as a pricing decision before launch',
  },
  {
    key: 'seatDriverSharePct',
    what: 'The rider share of a Travel Buddy seat fare. Null on the live card, so it falls back to a hardcoded 75%',
    where: 'Rate card, Pricing page. Needs a PUBLISH',
    blocks: 'Nothing today, but the column was added specifically because this share was a literal 0.75 buried in computeSeatPrice and should be admin-tunable. Until a value is published it is still effectively hardcoded, so that fix is not finished',
    from: 'Founder, before Travel Buddy carries paying passengers',
  },
] as const;
