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

  // NEEDS_DATA. The footer used to dial +234 800 000 0000, a placeholder that
  // connected to nothing, removed 2026-08-14. In Nigeria a WhatsApp link
  // converts far better than an email form, so prefer whatsapp over phone.
  // Set whatsapp to a full international number with no punctuation, e.g.
  // '2348012345678', and the footer and contact page will render it.
  whatsapp: null as string | null,
  phone: null as string | null,
} as const;

// ── Site ────────────────────────────────────────────────────────────────────
// NEEDS_DATA: three different canonical domains are referenced across
// layout.tsx, sitemap.ts and CookieBanner. Set NEXT_PUBLIC_SITE_URL on Vercel
// and this becomes the single source.
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
  // NEEDS_DATA, standing in until the capture session (founder 2026-08-14:
  // "use the current screenshot that we have, we will replace them later").
  // These three currently point at the two driver captures, so the story
  // rows show real SEIRS UI rather than a skeleton, but they are the wrong
  // app and the middle one repeats. Swap all three the moment the customer
  // app captures exist: booking, driver-accepted, live tracking.
  customerBooking: '/app-shots/driver-home.png',
  customerDriverAccepted: '/app-shots/driver-earnings.png',
  customerTracking: '/app-shots/driver-home.png',
  // LIVE: already in the repo, and correct for their own section.
  driverHome: '/app-shots/driver-home.png',
  driverEarnings: '/app-shots/driver-earnings.png',
  // NEEDS_DATA: no business-app capture exists. Deliberately left null so it
  // draws the neutral skeleton rather than a driver screen mislabelled as
  // business, which is what the how-it-works section is doing today.
  businessDashboard: null,
};

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
    key: 'APPLE_APP_IDS',
    what: 'Numeric App Store ids for customer, driver and business',
    where: 'src/lib/launch.ts',
    blocks: 'iOS store links fall back to an App Store search',
    from: 'App Store Connect, once each app record exists',
  },
  {
    key: 'APP_SCREENSHOTS.customer*',
    what: 'Three customer-app captures: booking, driver accepted, live tracking',
    where: 'public/app-shots/ plus src/lib/launch.ts',
    blocks: 'How it Works story rows draw skeleton screens instead of real UI',
    from: 'Capture session from the connected phone',
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
    what: 'The one canonical domain',
    where: 'Vercel env vars',
    blocks: 'Sitemap, OG tags and cookie copy disagree on the domain',
    from: 'Founder, once the domain is chosen',
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
] as const;
