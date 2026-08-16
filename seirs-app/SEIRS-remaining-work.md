# SEIRS remaining work

**Generated:** 2026-08-14 (quick static audit, HEAD = `76be127`, tree clean)
**Method:** marker sweep (TODO/FIXME/stub/mock), test-file inventory, doc cross-check against `docs/launch/LAUNCH_CHECKLIST.md`. No builds, no test runs, no line-by-line review.

## Summary

| Package | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| customer-app | 2 | 2 | 0 | 1 | 5 |
| driver-app | 0 | 1 | 0 | 1 | 2 |
| business-app | 0 | 1 | 0 | 1 | 2 |
| admin-dashboard | 0 | 0 | 2 | 0 | 2 |
| seirs-backend | 0 | 2 | 3 | 1 | 6 |
| seirs-website | 0 | 1 | 2 | 0 | 3 |
| shared | 0 | 0 | 0 | 0 | 0 |
| repo-wide / ops | 1 | 2 | 2 | 1 | 6 |

Priority key: **P0** blocks launch or shows wrong money to a user. **P1** ship-before-launch. **P2** first week after launch. **P3** cleanup.

---

## customer-app

| # | Item | Evidence | Type | Priority |
|---|---|---|---|---|
| 1 | Transaction detail renders fabricated receipts. Unknown id falls through to `MOCK_TRANSACTIONS[0]`, so a user can be shown a stranger-shaped receipt that was never calculated. No API call on this screen. | `app/(customer)/transaction/[id].tsx:10,31` | Stub | P0 |
| 2 | Cancel flow with real money never tested end to end (carried over from the previous session). Needs the phone plus a live Flutterwave charge. | session carry-over | Test gap | P0 |
| 3 | Four more screens still resolve mock data as source or fallback: trip-progress (`MOCK_TRIPS`/`MOCK_DRIVERS`), share-trip (`MOCK_TRIPS`), confirm-ride (driver chosen from `MOCK_DRIVERS` by string hash), fare-breakdown (`MOCK_VEHICLES`). | `trip-progress.tsx:42-60`, `share-trip.tsx:29`, `confirm-ride.tsx:93-95`, `fare-breakdown.tsx:54` | Stub | P1 |
| 4 | Rate limiter false-lockout test still open. Limiter was switched on in `2510372` but never exercised against real signup/login retry patterns. | session carry-over | Test gap | P1 |
| 5 | `serviceFeePct` marked for deprecation in two rate-card shapes, to be baked into base + perKm. | `constants/rateCard.ts:260,267` | TODO | P3 |

## driver-app

| # | Item | Evidence | Type | Priority |
|---|---|---|---|---|
| 1 | Multi-stop "delivered" ships with no proof of delivery. Backend accepts null, so a stop can be closed with no photo and no signature. A `signature.tsx` capture screen already exists but is not wired into this flow. | `app/(driver)/delivery/[id].tsx:123` | Unfinished | P1 |
| 2 | `constants/driverMockData.ts` is effectively orphaned (profile.tsx dropped it, only help.tsx still pulls from the mock module). Dead weight that invites reuse. | `constants/driverMockData.ts` | Cleanup | P3 |

## business-app

| # | Item | Evidence | Type | Priority |
|---|---|---|---|---|
| 1 | `isInterState` is hardcoded `false` on every quote, so the interstate surcharge never applies to a business delivery no matter what states the pickup and stops are in. Revenue leak, not a crash. | `app/(business)/(tabs)/new-delivery.tsx:295` | TODO | P1 |
| 2 | Drawer routes some destinations to the browser rather than shipping in-app screens (deliberate, per the comment, but still an unfinished surface). | `components/Drawer.tsx:70` | Deferred | P3 |

## admin-dashboard

| # | Item | Evidence | Type | Priority |
|---|---|---|---|---|
| 1 | `setupTOTP` / `confirmTOTP` return canned success strings. The comment says the auth module owns the real flow. Worth confirming the admin UI calls the auth route and not these, since a stub that always answers "TOTP confirmed" is a bad thing to have reachable. | `seirs-backend/src/admin/admin.service.ts:1757-1765` | Stub | P2 |
| 2 | Rate-card edit propagation (admin `/pricing` bump reaching apps within 60s) never manually verified. | `docs/launch/LAUNCH_CHECKLIST.md` | Test gap | P2 |

## seirs-backend

| # | Item | Evidence | Type | Priority |
|---|---|---|---|---|
| 1 | The test suite cannot run. `npm test` is `jest`, jest is not a dependency of the backend or the root workspace and is not installed in either `node_modules`. The repo has exactly one spec file. Attempting `npx jest` fails on the npm cache ("Lock compromised"). | `seirs-backend/package.json`, `src/pricing/regions.spec.ts` | Test gap | P1 |
| 2 | Cron worker on Railway unverified. Crons silently no-op if the scheduler module fails to boot, which would stop payouts, escrow release, and tier recalculation with no error surface. | `docs/launch/LAUNCH_CHECKLIST.md` | Ops | P1 |
| 3 | Developer-platform `callsToday` has no reset cron. The counter grows monotonically from last manual reset, so per-day quota reporting drifts and any day-based cap would eventually lock a developer out permanently. | `src/developer-platform/api-key.guard.ts:84` | TODO | P2 |
| 4 | Loyalty fraud signal is detected but never emitted to the `/admin/fraud` queue, so nothing reaches manual review. | `src/loyalty/loyalty.service.ts:335` | TODO | P2 |
| 5 | `listCapacityNearby` ignores lat, lng and radius and returns every active store. Fine while the store count is small, wrong as soon as the customer "pick a store" UI ships. | `src/partner-store/partner-store.service.ts:600` | Stub | P2 |
| 6 | Add-card verify plus auto-refund cost review still open (founder decision, explicitly deferred, do not change without asking). | `src/payments/payments.service.ts:107` | Deferred | P3 |

## seirs-website

| # | Item | Evidence | Type | Priority |
|---|---|---|---|---|
| 1 | Two different env names point at the same backend. `cms.ts` and `contact` read `NEXT_PUBLIC_API_BASE_URL`, while `track/[code]`, `find-a-partner` and `reset-password` read `NEXT_PUBLIC_API_URL`. Both have hardcoded fallbacks, so setting only one on Vercel leaves half the site talking to the fallback host with no error. | `src/lib/cms.ts:9`, `src/app/contact/page.tsx:77`, `src/app/track/[code]/page.tsx:24`, `src/app/find-a-partner/page.tsx:28`, `src/app/reset-password/page.tsx:20` | Gap | P1 |
| 2 | `NEXT_PUBLIC_PLAY_STORE_URL` and `NEXT_PUBLIC_APP_STORE_URL` unset, so store badges render in the dimmed "coming soon" state. Launch-day flip. | `src/components/AppStoreBadges.tsx` | Config | P2 |
| 3 | `NEXT_PUBLIC_SITE_URL` unset. The sitemap builds from it. | `docs/launch/LAUNCH_CHECKLIST.md` | Config | P2 |

## shared

No TODO/FIXME markers and no stubs found. Standing risk rather than an open item: any new export from `shared/services/api.ts` must be added to each app's `services/api.ts` barrel whitelist, or the import resolves to undefined and the app red-screens at runtime.

## Repo-wide and operational

| # | Item | Evidence | Type | Priority |
|---|---|---|---|---|
| 1 | Four manual end-to-end walks unrun: customer golden path through payout, business cancel plus wallet refund, partner-store drop-off and release, rate-card propagation. | `docs/launch/LAUNCH_CHECKLIST.md` | Test gap | P0 |
| 2 | No error monitoring. Sentry projects and DSNs not created, so production exceptions are invisible. | `docs/launch/08-observability.md` | Ops | P1 |
| 3 | No uptime monitoring. Better Stack monitors not set up. | `docs/launch/08-observability.md` | Ops | P1 |
| 4 | Domain pointing plus SSL for the three subdomains not done. | `docs/launch/LAUNCH_CHECKLIST.md` | Ops | P2 |
| 5 | Three Google Play listings, privacy labels, and the closed-testing track not started. | `docs/launch/LAUNCH_CHECKLIST.md` | Ops | P2 |
| 6 | Legal and ops workstreams 1 through 8 (payments lawyer, insurance, NDPR, state licence, Flutterwave rates, dispute playbook) all at "not started". Drafts exist. | `docs/launch/LAUNCH_CHECKLIST.md` | Ops | P3 |
| 7 | `ECOSYSTEM_AUDIT_2026-05-10.md` and `LAUNCH_CHECKLIST.md` (generated 2026-05-16, claims "zero real gaps") both predate this table and are stale. | repo root, `docs/launch/` | Cleanup | P3 |

---

## Recommended next bucket

**Money-facing stubs in customer-app and business-app.** Two small edits, both in the same class as the bugs already fixed in `054da1c` and `9f0f24c`: the transaction screen that shows a fabricated receipt for any unknown id, and the business quote that never charges the interstate surcharge. Both are contained, both are wrong in front of a paying user, and neither needs the phone.

Other paths:
- **Driver proof of delivery** (P1, one screen to wire, `signature.tsx` already exists)
- **Live tests that need the phone** (cancel flow with real money, rate-limiter lockout) if the phone is plugged in
- **Observability** (P1, no code, just DSNs and monitors, but it is what turns a silent production failure into an alert)

## Caveats

This was a marker-and-doc sweep, not a review. It will not have caught logic that is wrong without a comment saying so. Nothing was compiled and no test was executed, because the repo has no installed test runner.
