# Night work order, 27 August 2026

Queued while the founder tests on the phone. Everything here is work he
has approved in principle but which needs long builds or long stretches
of uninterrupted editing, so it waits until the machine is free.

Ordered by value, not by size.

---

## 1. Zones, replacing three dead pricing features

**Spec:** https://claude.ai/code/artifact/2b9ad396-1537-494b-9082-e10f3b066931

**All four decisions are answered, so this is ready to build.**

Hotspot circles, restricted sub-zones and geopolitical zone overrides
are all the same idea, all live in `regions`, and `regions` is null on
the live card. All three are inert today.

None of them can express the thing that matters: an area where SEIRS
does not operate. Founder: *"when i say close it means closed so no
form of operation there."*

Decided:

- **Closing is a permission, not a role.** `zones.view`, `zones.price`,
  `zones.close`. `super_admin` gets all three through its existing `*`
  wildcard. A custom role holding only `zones.close` lets one person
  shut an area during an emergency without touching prices, payouts or
  accounts. Founder: *"the ability to give some of the super admin
  things to someone else... without giving it all away."* Every close
  and reopen is audit-logged with who and why.
- **Closures expire.** Blocking statuses require an end date, default 7
  days, renewable. A standing dashboard banner while any zone is
  blocking, a warning 48 hours before expiry, and an announcement when
  one lapses on its own.
- **Five statuses**, with `no_pickup` and `no_dropoff` separate, because
  evacuation is one-directional.
- **A blocked address is shown then refused with the reason**, at the
  moment it is picked, never at checkout.

Engine constraint found while writing the spec: `resolveRegion` is only
ever called with the PICKUP, at pricing.service lines 596 and 870.
There is no destination-side zone resolution at all, so blocking a
drop-off is new plumbing rather than new data.

---

## 2. Notification audit, the whole admin surface

Founder, after changing his own payout account: *"i changed the payout
bank account, but look at this no notifications... the admin dashboard
need you to look at the whole thing indepthly for places that need
notification so we don't miss a lot of things i am very sure kyc or
change of something may not even have notification."*

**Already fixed:** bank detail changes now notify the account holder on
both the first-time and the pending-review paths. That one was the
payout-redirect vector: someone gets into an account, points payouts at
their own bank, and the owner finds out when money stops arriving.

**The systematic problem:** the platform has NINE notification types
total, and every one of them is about a delivery or a chat:

    job_request, delivery_assigned, status_update, delivery_complete,
    payment_received, chat_message, sos_alert, general, system

**Not one covers an account or security event.** So the audit is not
"which handlers forgot to call notify", it is "this category of
notification does not exist yet".

Sweep every state change and decide, for each, whether the person it
happens to is told. Candidates, in rough order of harm if missed:

| Event | Who must know | Exists |
|---|---|---|
| Payout bank account changed | account holder | **fixed 27 Aug** |
| Password changed | account holder | check |
| Email changed | old AND new address | check |
| Payout sent or failed | rider or partner | check, earnings.service has no notify calls at all |
| KYC approved or rejected | applicant | check |
| Vehicle change approved or rejected | rider | check |
| Account suspended or reactivated | account holder | check |
| Admin role or permissions changed | that admin | check |
| A new device signed in | account holder | almost certainly missing |
| Deletion requested or scheduled | account holder | check |
| Partner application approved or rejected | applicant | check |
| Dispute opened or resolved | both parties | check |

Deliverable: a table of every event, whether it notifies in-app, by
email, or not at all, and a fix for each gap. Some deserve BOTH: a
security event a user might not open the app to see needs an email.

---

## 3. Exportable data, gated by role

Founder: *"for the earning and withdrawals why dont we have a details
exportable data for important things like that in all places that need
it, maybe exportable should be gated by admin."*

**Today there is exactly ONE export in the entire admin:**
`GET /admin/users/:id/export`, the NDPR subject-access export. Nothing
else can be exported at all, including money.

That is a real gap for a business that has to reconcile with a bank,
answer a rider who disputes a payout, and file with FIRS.

### Approach

**One shared export mechanism, not a button bolted onto each page.**
Nine bespoke CSV writers will drift the way `StreetAutocomplete` did.

    GET /admin/export/:dataset?from=&to=&format=csv|xlsx&...filters

- `:dataset` is a registered name, and each registration declares its
  columns, its permission, and how it queries. Adding an export becomes
  a registration, not a new endpoint.
- **Filters mirror the page the admin is looking at**, so what exports
  is what they can see. An export that quietly returns more rows than
  the screen is how data leaves by accident.
- **Streamed, not buffered.** A year of deliveries must not be built in
  memory. Postgres cursor to a streaming CSV writer.
- **Every export is audit-logged**: who, which dataset, which filters,
  how many rows. An export is a copy of the data leaving the building
  and should be as traceable as a refund.

### Datasets to ship, and why each one

| Dataset | Columns that matter | Who needs it |
|---|---|---|
| **Driver earnings** | delivery, gross, SEIRS cut, driver net, status, available date | reconciling a rider's dispute |
| **Payouts and withdrawals** | reference, rider, amount, bank, status, Flutterwave ref, timestamps | matching the bank statement |
| **Deliveries** | tracking code, both addresses, vehicle, price breakdown, driver, statuses with times | operations and any dispute |
| **Payments** | reference, customer, amount, method, escrow status, released at | FIRS and reconciliation |
| **Partner store earnings** | store, counter fees, share, settled | paying partners |
| **Refunds and cancellations** | delivery, who cancelled, fee withheld, refunded | pattern-spotting on refund abuse |
| **Users and drivers** | the NDPR-safe subset only | ops, never a full dump |

### Gating

Founder said gated by admin. Sharper than that: **a permission per
dataset**, matching the zones decision.

    export.financial   earnings, payouts, payments, refunds
    export.operations  deliveries, partner earnings
    export.people      users and drivers, NDPR-safe columns only

Finance can pull money without pulling personal data. Ops can pull runs
without pulling bank references. `super_admin` gets all three through
the existing wildcard.

**Never exportable, by any role:** full bank account numbers (last four
only), card tokens, password hashes, OTP hashes, KYC document URLs. An
export is the easiest way for the worst possible file to end up on
someone's laptop.

---

## 4. The launch reset

Founder has asked for this more than once. **It does not exist.**
Searched the backend and the admin: there is no wipe-demo-data, no
factory reset, no launch reset anywhere.

This gates launch: the platform currently carries demo drivers,
seeded cohorts, test deliveries and staged balances, and going live
with them mixed into real data is not recoverable.

### Approach

**Not a delete-everything button.** A dry run first, always.

1. **Preview.** Counts every row it would remove, by table, and shows
   them before anything happens. Nothing is destroyed on this step.
2. **Scope by `isDemo`**, not by date. Every seeded account and cohort
   already carries the flag; deleting by date would take real early
   bookings with it.
3. **Refuse to delete anything with real money attached.** A demo
   account that somehow took a real payment is a data problem to look
   at, not a row to quietly drop.
4. **Type the word.** Confirmation by typing RESET, plus super admin,
   plus audit log.
5. **Keep the rate card, fee catalogue, zones, email templates and
   admin accounts.** Configuration is not demo data, and rebuilding the
   fee catalogue by hand the night before launch is its own disaster.
6. **A dated snapshot** of what was removed, so an accidental reset is
   recoverable.

---

## 5. The admin dashboard needs its own sweep

Founder, 27 Aug: *"as we design the apps let's make sure we don't forget
the admin dashboard."*

He is right, and one day of looking proves it. Every one of these was
found by accident while doing something else, which means nobody has
ever swept the dashboard on purpose:

- **A collapsed sidebar could not be expanded.** The 60px rail rendered
  a 28px mark AND a 24px toggle inside it with `overflow-hidden`, so the
  expand button was clipped off the edge. The state persists in
  localStorage, so once collapsed it stayed collapsed on every page,
  every reload, with no way back.
- **The In-App CMS wrote to a table nothing reads.** Cost the founder a
  day before anyone noticed.
- **A legacy wallet tile** held prime position on the driver page,
  explaining at length a number that is zero for every rider and always
  will be.
- **A stale note** claimed completed and in-progress counts were missing
  from the API. Two of the three had been added and nobody updated it.
- **Three pricing knobs do nothing.** Hotspots, restricted sub-zones and
  zone overrides all write into `regions`, which is null.
- **No exports at all** except the NDPR one.
- **No account or security notifications** exist as a category.

The pattern is the same each time: a surface that LOOKS finished, does
not throw, and quietly does nothing. That is worse than a visible gap,
because nobody goes looking.

### The sweep

Page by page, every route in `apps/admin-dashboard/src/app/`, asking
four questions of each:

1. **Does it read live data, or render constants?** Name every page
   still showing hardcoded rows.
2. **Does every control do what it says?** Every button, filter, toggle
   and form: does the write land, and does the page prove it landed?
3. **Does it say anything untrue?** Stale notes, labels that promise
   behaviour that was never wired, "coming soon" on shipped features.
4. **Is anything unreachable?** Clipped controls, nav entries pointing
   at nothing, states with no way out.

Deliverable: one table of page, finding, severity, and whether it is a
fix or a deletion. Deleting a decorative page beats leaving it: the CMS
proved that.

---

## 6. Shared address field, with coordinates on every surface

Founder: Nigerian addresses are unreliable, so every address field
should carry coordinates.

**Already done:** `PlacePicker` now lives in `shared/components/` and
the driver interstate screen uses it for FROM and TO, refusing to
submit unless both ends were picked. Route distance derives from the
two points instead of being typed, which also closed the exposure where
a rider typed the number that set the seat price.

**Still to do:**

- `StreetAutocomplete` still exists TWICE, in customer and business, as
  copies that have drifted. Migrate both onto `PlacePicker`.
- Add the other input modes: drop a pin, use my current location, paste
  a location link (parse coordinates out of a Google Maps or WhatsApp
  share, which is how Nigerians actually exchange locations), landmark
  free text for the last 50 metres, and raw lat/lng collapsed under
  "advanced" for depots.
- Wire the nine entry points: customer register, addresses, request,
  send, track; business register, apply-partner, edit-profile,
  send-package.

---

## 7. Coordinate survival audit

Separate from the input work and worth doing regardless.

Every address should carry its coordinates all the way to the rider's
Directions button. At least one place did not: the mid-route address
change passed flat `lat`/`lng` that the engine ignores, because it
reads `pickupCoords.latitude`. Fixed 27 Aug, but that is the SECOND
time this exact mistake has shipped, so every call site needs checking.

---

## 8. Email template design system

Founder: multiple real designs visible in the dashboard with colours
and images, the ability to create new ones, seasonal cases like
Christmas and birthdays, a scheduler, and an editor a non-technical
person can use that shows the ACTUAL rendered email, not markup.

**Shipped already:** the editor now controls what sends, test-send to
your own inbox, per-template banner and header colour, four seasonal
templates.

**Still to build:** the gallery of real designs, create-from-existing,
the editor with an iframe preview of the real render, and the campaign
scheduler. The send path must default to sending only to the requesting
admin until the founder explicitly enables real bulk sending.

---

## 9. Cancellation-pay wiring

Lost to the laptop crash on 25 Aug and never rebuilt. The only piece of
that night's work still missing.

---

## Smaller, still open

- **Business app bottom nav says "Wallet".** Senders never hold naira
  balances, so the name implies a stored balance we do not offer and do
  not want to imply under CBN rules. Naming decision, not a bug.
- **Driver and business APKs are ~200MB against customer's 109MB.**
  Same framework, similar screens, so the gap is likely extra native
  modules or an ABI the customer build excludes.
- **v2 zone card.** The state-aware inter-state tier cannot run until a
  card carrying `interStateAdjacentPct` and `crossZonePct` is
  published. Coordinates already reach the engine; the card is the
  missing half.
- **Service fee is 0.00** and **high-value rider share is 0.** Both
  fully wired, both purely decisions.
- **Distance Matrix API** must be enabled on whichever key Railway
  holds, or the multi-drop road ordering silently falls back to
  straight-line.

---

## Environment notes worth keeping

- **`--offline` is mandatory** when starting Metro. Without it the Expo
  CLI hits a dependency-check endpoint, throws
  `TypeError: Body is unusable: Body has already been read`, and kills
  Metro seconds after it binds the port.
- **Bundle the apps one at a time.** Three Metros starting together put
  the laptop at 0.26GB free and even a local curl timed out.
- **One app at a time on the PHONE.** Three React Native dev builds
  hold ~1.17GB on a 3.8GB device and the third is starved before it can
  finish starting. Nothing errors; it just never leaves the splash.
- **Gradle daemons hold ~1GB AFTER the build finishes** and never
  release on their own. Kill them or the next thing you run starves.
- **A Gradle rebuild is about 26 to 35 minutes** on this machine.
- **Do not pipe a long build through `tail`.** It buffers, so there is
  no progress output until the command finishes.
- **`expo run:android --port` and `--no-bundler` are mutually
  exclusive**, and `run:android` defaults the dev-client URL to 8081
  regardless of which Metro is actually serving the app.
