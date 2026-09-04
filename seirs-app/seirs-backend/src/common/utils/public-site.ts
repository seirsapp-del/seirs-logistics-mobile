/**
 * The one place that answers "where does the public website live?".
 *
 * WHY THIS EXISTS. A sweep on 2026-09-04 found FIVE environment variable
 * names meaning the same thing, with three different fallbacks between them:
 *
 *   PUBLIC_SITE_URL       6 uses, fell back to https://seirs.app
 *   WEBSITE_URL           6 uses, fell back to the Vercel host
 *   NEXT_PUBLIC_SITE_URL  4 uses, fell back to https://seirs.co
 *   PUBLIC_WEB_URL        4 uses, no fallback at all
 *   WEB_URL               2 uses, no fallback at all
 *
 * So the link a person received depended on which code path produced it, and
 * whichever of the five happened to be set on that deploy.
 *
 * seirs.app DOES NOT RESOLVE. It is not a domain we own and reach; it is a
 * placeholder that outlived the plan to buy it. Three live code paths fell
 * back to it, and one of them is the redirect URL a receiver lands on after
 * paying a redirect fee in a browser: the money leaves their account and the
 * callback goes nowhere. Another is the collect link that reveals which
 * counter is holding their parcel, so an unresolved host there means the fee
 * is never settled and the parcel sits on a shelf accruing storage.
 *
 * This reads every name any deploy might have set, in the order they were
 * introduced, and ends on a host that is actually reachable today. When the
 * real domain lands, set PUBLIC_SITE_URL and every caller follows; change the
 * last line and even an unconfigured environment is correct.
 */
export function publicSiteUrl(): string {
  const raw =
    process.env.PUBLIC_SITE_URL ||
    process.env.WEBSITE_URL ||
    process.env.PUBLIC_WEB_URL ||
    process.env.WEB_URL ||
    'https://seirs-website.vercel.app';
  // A trailing slash turns `${site}/collect/X` into a 404 on some hosts.
  return raw.replace(/\/+$/, '');
}
