# SEIRS sweep addendum, 24 August 2026

Follow-on work after the 23 August register. Hand-written, not generated:
the register itself is built from `scratchpad/reg/*.py` and should keep
being regenerated from there.

Context for the day: the founder made the platform's first real payment
(`SRS-9CJ7LJP2`, NGN 2,609.06, escrow held, driver assigned, in transit),
pressed the SOS button on a live trip, and read the admin dashboard while
it happened. Most of what follows was found by doing those things rather
than by reading code.

---

## One root cause, four dead features

`notifications` was the only module in the backend without an
`ALTER TYPE ... ADD VALUE IF NOT EXISTS` self-heal at boot. Production runs
with `synchronize` off, so the deployed Postgres enum is frozen at whatever
the last `SYNC_DB=true` deploy created. Three `NotificationType` values were
added after that point (`chat_message`, `sos_alert`, `system`) and never
existed in the database. Every write using one threw.

| Feature | Call site | Failure mode |
|---|---|---|
| SOS alert to the other party on the trip | `sos.service.ts:110` | Silent, swallowed by `.catch(() => {})` |
| Chat message notification | `chat.service.ts:256` | Silent, swallowed by `.catch(() => {})` |
| Ops broadcast composer | `notifications.service.ts:319` | Throws |
| Admin direct message to a user | `notifications.service.ts:283` | Throws |

The SOS one is the serious one: the button worked, admins saw the alert,
and the other person on the trip was never told, with nothing logged.

Fixed in `notifications.module.ts` with the same `onModuleInit` self-heal
every other module already had.

---

## Money reporting was wrong on the dashboard

Found by comparing `/admin/stats` against the one real transaction.

`commission` was `total revenue x PLATFORM_COMMISSION`, a `0.30` constant
in `common/constants/pricing.ts`. That is not what SEIRS earns. The real
margin is the spread between the customer price and the driver's share,
and both sides come from the active rate card.

| | Live order `SRS-9CJ7LJP2` |
|---|---|
| Customer paid | NGN 2,609.06 |
| Driver's share | NGN 1,469.68 |
| Actual SEIRS margin | NGN 1,139.38 (43.7%) |
| What the dashboard reported | NGN 782.72 |

Both sums now come from real columns on delivered rows, and
`commissionRate` is derived rather than declared. It returns `null` rather
than a fake zero when nothing has been delivered.

Also fixed: `getRevenueSplit` ran `Math.round` on gross, reporting
NGN 2,609.06 as `2609`. The kobo rule exists so these figures reconcile
against the payment they came from.

---

## `/admin/driver-compliance` returned 500 on every call

`admin.service.ts` compared `notifications."userId"` (varchar, from a bare
`@Column()` on a string field) against `drivers."userId"` (uuid, mirroring
the `users.id` it references). Postgres has no implicit cast between them,
so the planner rejected the query outright and the Last Order Compliance
page never loaded. It is the only raw SQL in the codebase touching
`notifications`, which is why nothing else exposed the mismatch.

Both sides now cast to text, `n.type` included, so an enum label the
deployed type does not carry can never take the whole query down again.

---

## A cancelled delivery never paid the rider

`cancelByCustomer` computes `driverShareNgn` from the
`cancel_post_assign_driver` fee row, writes it into the log line, returns
it to the app, and stops. Driver ledger rows are only created on escrow
release (`payments.service.ts:1091`), which a cancelled delivery never
reaches.

So a rider who drove to a pickup and had the job pulled was owed money that
nothing recorded and the payout run could never find.

Now written to the ledger at cancellation with `seirsCutPercent: 0`, since
this is compensation for a trip that was made, not a commissioned job.

---

## Admin navigation

49 pages against 41 nav entries. No dead links: every href resolves. The
gap is 4 detail routes, 3 chromeless auth pages, and 1 documented redirect,
plus `/sos`, which was the only genuine orphan.

| Fix | Detail |
|---|---|
| SOS Desk nav entry | Was reachable only through the alert banner. Added, then corrected: it was first given `permission: 'overview'`, which `support_agent`, `driver_compliance` and `media_content` do not hold, so the three roles who most need it would have seen the banner and had no page. Now its own `sos` key granted to all 8 roles, plus an `ALWAYS_GRANTED` list, because a custom dynamic role takes its permissions from the backend catalogue and this app cannot add a slug to it |
| `/disputes?deliveryId=` | Pre-filled the input but never ran the lookup, so you arrived at an empty page that was already holding the answer |
| `/?denied=1` | Nothing read the parameter, so a refused admin was silently teleported to the dashboard with no explanation |
| Back links | `/drivers/[id]` and `/users/[id]` had none |

Badges on Support Inbox and Fraud both verified live, polling real data,
hidden at zero. All 37 nav icons registered, none silently falling back.

---

## Mobile app findings closed

| ID | What it actually was |
|---|---|
| D-10.1 | "My Trips" only called an active-statuses endpoint, so Delivered was permanently empty and the badge read NGN 0.00. Finished trips now come from the earnings ledger, merged and deduped |
| D-9.2 | The proof-of-delivery step was a standing TODO. The backend had persisted `proofPhotoUrls` all along |
| D-1.5, D-6.9 | Decline on a pool job promised re-offer and delivered nothing. Copy now says Skip, and the countdown no longer claims to auto-decline |
| D-1.11 | Acceptance card showed a permanent dash under an 80% gate |
| C-4.6 | Bottom inset floor, matching Send and onboarding |

### Found outside the register

1. **The customer tip was never charged and never paid.** `rate/[driverId].tsx` offered NGN 100/200/500 and put "Submit Rating + NGN 500 tip" on the button. `handleSubmit` sent stars and a note. No tip endpoint exists anywhere in the backend. Removed rather than left as a promise the system cannot keep
2. Fabricated per-vehicle ETAs on the cargo picker ('4 min', '6 min', '18 min') beside a clock icon, against the no-time-promise rule. Replaced with payload capacity
3. A Google `durationText` threaded through three files of the booking flow, declared and never read
4. Kobo rule, driver bar chart: `(amount/1000).toFixed(0)}k` printed NGN 1,500 as "2k"
5. Kobo rule, EarningsCalendar: a day earning 850.75 read 851, so the squares did not add up to the month total
6. Two customer tab hrefs absent from the generated route union, both hidden behind `as any`
7. Dead i18n for retired features: the whole business `wallet` block, against the no-business-wallet policy

---

## Still open

### Needs a backend route
- **D-1.6** trunk-check photo: `POST /deliveries/:id/driver-note` with `{ photoUrl }`. `DeliveryEventType.DRIVER_NOTE` already exists with `meta.photoUrl` and has no controller
- **D-4.6** single transaction fetch: `GET /earnings/:id`
- **D-10.8** `RegisterDto` has no `firstName`/`lastName`, so the client cannot send them

### Needs a decision
- **`serviceFees` is zero on the active rate card** for both rides and packages. This came from the migration backfill at `pricing.service.ts:236`, not from a decision. The field is fully wired: flat per booking, added after discounts so no promo erodes it, before VAT, 100% SEIRS, editable at `/pricing`. At NGN 100 per booking it is roughly NGN 520,000 a month at the volume in the pitch model. It is flat, so it is regressive on cheap trips, which matters for the bicycle and on-foot tier
- **D-2.4** pool cap: there is no `pool_cap` row in `fees.seed.ts` and no server-side enforcement at all. The "4" is cosmetic. Lower priority while pooling stays deferred
- **`/partner-redirects`** has a nav entry behind a feature flag set to `false`, so operators never see it while the page renders a preview against no backend

### Known risk, not yet acted on
- The driver-app `withdrawal` i18n block is entirely unused and contains "Withdrawals typically arrive within 30 minutes via NIP transfer" and a hardcoded "Minimum withdrawal NGN 1,000" that contradicts the catalogue-driven minimum. Dead today, a loaded gun if anyone wires i18n into `withdrawal.tsx`

---

## Verification state

All builds and typechecks green: three app typechecks at 0 errors,
`nest build` and `next build` both exit 0.

Nothing in this document has been deployed. Production still carries every
bug described above.

**Not verified on a device:** the proof-photo path, the merged history
feed, and the copy changes have not been driven on the phone. Delivered
rows in "My Trips" show "Customer" or "Passenger" rather than a name,
because the earnings ledger carries no customer relation.
