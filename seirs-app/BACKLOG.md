# SEIRS backlog

Everything agreed but deferred, so it stops living in a chat log.
Last updated 2026-08-18.

## Waiting on the founder

| Item | Why it is theirs |
|---|---|
| Restrict the Google Maps key in Google Cloud Console (package name + release SHA-1 for Android, bundle id for iOS, and limit to the APIs actually used) | Console work. The key is out of git, but a Maps key ships inside the APK and can always be extracted, so restriction is the only real protection. |
| Confirm whether the NIPOST Postal Fund 2% is assessed on gross bookings or net revenue | Needs counsel. The difference is roughly a tenth of everything the company keeps. `nipost_postal_fund_pct` is modelled at the pessimistic reading meanwhile. |
| Check Flutterwave's actual add-card rate in the merchant dashboard | The ₦100 verify-and-refund cost was flagged as a concern; merchant rates are not visible from here. |
| Decide the return-to-sender fee model | Currently a flat ₦1,500 with no policy behind it. |
| Spec the weekly-goal reward programme | Never specced. |

## Build queue, in order of money at stake

| Item | Detail |
|---|---|
| Trunk-run batching | Consolidated counter pricing is built and gated behind `consolidated_dispatch_enabled` (0). Dispatch still creates one driver leg per drop-off, so switching it on would charge a sixth of a run and pay for six. This is the whole 11.8x case for the counter network. |
| CSV bulk upload onto the real engine | `bulk.service.ts` uses the legacy 90-line `deliveries/pricing.service.ts`: a flat ₦300 + ₦80/km with NO fuel recovery, roughly half the real engine. Founder deferred until single and multi-package orders are settled. |
| Failed deliveries as a measured metric | `door_delivery_failure_pct` is an 8% assumption feeding every contribution figure. Needs real tracking with a naira cost attached. |
| Relay leg-pool cap | Before any multi-leg journey ships: `sum(legs) <= route price - VAT - counter fees - minimum margin`. Without it a three-leg run pays out more than it collects while each leg looks reasonable. |
| Return-leg matching for interstate | A truck to Kano must come back. Either the price carries the return or the second half is sold to someone else. |
| Checkpoint levy allowance on long haul | Informal levies are reported at ₦50,000-100,000 per long-haul trip and are currently the driver's private problem. |
| Counter scorecard | Volume, dwell time, disputes, earnings per counter, so partner quality is measurable and any density bonus is paid on evidence. |
| Danfo on the rate card | A 14-seater passenger bus. The card only carries a cargo van with a payload rating, so danfo pricing cannot be admin-controlled until a passenger-bus entry exists. |
| Translations | 5 of 49 screens use `t()`. Founder decision: do the whole extraction once, when launch-ready. |
| Insurance go-live | On the rate card, disabled, all values zero. Switch-on order is documented on the admin Pricing page. Needs an underwriter first. |

## Removed on purpose

**Business team members, deleted entirely 2026-08-19.** Not hidden, not
flagged off: the screen, the three routes, the API client methods, the
invite email, the invite activation, the role enum and the
`business_team_members` table are all gone, and the table is dropped on
boot.

The reason was not scope. The UI advertised roles as access restrictions
("Viewer: read-only access to dashboard") while `requireTeamRole` was
applied to three routes out of dozens, so a Viewer could do nearly
everything. That is a false security claim, which is worse than having
no roles at all. Along the way the invite was also a dead end: rows were
created `pending` and nothing ever set them `active`, so an invited
colleague could register, verify, sign in and still have no access.

A business account now has exactly one actor, its owner, enforced by
`requireOwner`.

**If multi-user access is ever rebuilt:** enforce the role check on
EVERY business route first, then add the screen. Not the other way
round. The old shape is in git history at the commit that removed it.

## Dead code and known compromises

| Thing | State |
|---|---|
| `deliveries/pricing.service.ts` | Legacy 90-line calculator. Kept because CSV bulk still uses it; delete once bulk moves to the rate card. |
| `PricingService` imports in `deliveries.service.ts` and `matching.service.ts` | Injected, never called. Harmless; removing them touches core files for no behaviour change. |
| `current_fuel_price` fee row | Retired and deactivated. Superseded by `current_petrol_price_ngn` / `current_diesel_price_ngn`. |
| `partner_store_handling_ngn` | Demoted to a fallback for the tiered counter fees. |
| COD | `initiateCOD` deleted, pinned off in the customer app so no rate card can re-enable it. Enum value kept so historical rows still read. |

## MUST be restored before launch

Both were set to 0 for the live money test:

| Key | Now | Launch value |
|---|---|---|
| `driver_clearance_business_days` | 0 | 2 |
| `partner_payout_hold_hours` | 0 | 168 |
