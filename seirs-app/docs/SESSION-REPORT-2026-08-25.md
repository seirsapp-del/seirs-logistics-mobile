# Session report, 25 August 2026

Written while the founder was out. Two laptop crashes happened during
this session; the recovery is documented below because the failure mode
is worth knowing.

---

## Live in production, verified against the real API

### `359489d` — riders' bank details stopped going to customers

`GET /deliveries/:id` and the business equivalent returned the raw Driver
entity with its full User relation attached. `Delivery.driver` is eager,
`Driver.user` is eager, and nothing whitelisted the result.

A customer's phone was receiving their rider's `bankAccountNumber`,
`bankAccountName`, `bankCode`, `homeAddress`, `dateOfBirth`, `email`,
emergency contacts, `fcmToken`, every KYC document URL, `walletBalance`,
`valueLevel` and their account lockout state.

Nobody decided to share that. It was a side effect of two decorators and
would have grown with every column added to either table.

**Verified after deploy with an ordinary customer token:**

| | Before | After |
|---|---|---|
| driver keys | 38 | **11** |
| user keys | 46 | **5** |

The delivery LIST route was checked and does not leak: it uses a
QueryBuilder, and TypeORM ignores eager relations there.

### `ed9583f` — the chain of custody, which was never written

The deck opens with *"the parcel always has someone's name on it: every
person who touched the parcel signed for it."* The admin Liability
Disputes page, on a delivery that completed successfully, said **"No
handoff records yet for this delivery."**

The gap was worse than nothing calling it. **Only 2 of the 7 rows in the
liability matrix ever wrote a record**, both partner-store, and neither
named a human at the counter. A door-to-door delivery had no
`customer_to_driver` stage at all, so it produced an empty chain by
design.

And the founder's core requirement was discarded on arrival:
**`signatureName` was declared on the controller and never read by the
service.** The typed name never reached the record.

Now: records written at every boundary the matrix names, including the
plain `receivedByRelation: 'recipient'` path. `signatureName` is always
the party TAKING custody, `releasedByName` always the party giving it.
No per-stage variation, because a field that means different things on
different stages is unreadable a year later by whoever adjudicates.

New `POST /partner-store/receive-from-driver`. **Nothing at the
destination store scanned anything**, so the drop-off advanced on the
rider's word alone and "driver liable until the store scans" was
unenforceable. It is also the only thing that has ever set
`AWAITING_COLLECTION`, so recipients were never told their package had
landed.

**Expect an empty chain on `SRS-9CJ7LJP2`.** Records are written going
forward, not backfilled. The next delivery is the first to produce a real
one.

### A ride was impossible to complete

The server refused every `delivered` without a proof photo with **no
`kind` check**, while the driver app never offers the camera on a ride. A
passenger trip could be booked, paid for, driven, and never closed.

Fixed server-side. `Delivery.kind`'s own doc comment already says it
gates the package-only surfaces "including photos"; this call site simply
missed it. A passenger leaving a car is not a handover, and
photographing someone at their destination to close a trip is a privacy
problem rather than proof. Custody records are skipped on rides for the
same reason.

---

## Android's three-button limit, the theme of the whole sweep

`AlertDialog` renders only the FIRST THREE buttons and silently discards
the rest. No error, no warning, no log line. Everything past index 2 is
invisible to every Android user.

| Where | Passed | Silently hidden |
|---|---|---|
| Driver, cancel job | 6 | **"I feel unsafe"**, the one reason the copy says never counts against a rider's allowance |
| Driver, report a problem | 5 | **Cancel** (the founder was trapped by this live) and **"Unsafe or refused item"** |
| Driver, who received it | 4 | **"The recipient"**, how almost every delivery ends |
| Customer, Travel Buddy | up to 5 | On any trip with 3+ seats free: "3 seats", "4 seats" AND Cancel. **Could not sell more than two seats** |
| Customer, rewards redeem | 4 | `slice(0, 3)` was one over because Cancel counts too, so **a third active delivery was never selectable** |
| Business, appearance | 4 | Cancel, so the theme picker could not be dismissed |

Two of those are revenue. One is rider safety.

---

## Answers to the founder's questions

**Wallet balance is not out of sync. `drivers.walletBalance` is a dead
column.** Nothing credits it anywhere: zeroed at registration, set to
62,000 on demo drivers only, otherwise referenced in two delete
pre-flight checks. It reads NGN 0.00 for every real rider and always
will. Real money is `driver_earnings`, one row per delivered run, pending
to available to paid. `totalEarned` is a third thing: `SUM` over
delivered runs, a record of work done, not a balance owed. The admin UI
now labels all three honestly. **No number was altered.**

**SOS history now reaches the admin.** It was write-only: `GET
/sos/active` filters `status = 'active'`, the admin module never queried
the table, and the NDPR export omitted the category entirely. The
founder's resolved alert and its note were sitting in Postgres with no
route to reach them. Now on both the user and driver profiles.

**Completed-deliveries count** added as its own `count()` query. The old
`deliveredCount` filtered a 10-row page, so a customer with 400
deliveries would have shown 7. It was never returned, which is the only
reason nobody saw it.

**Vehicle change: self-serve with admin approval**, as decided. Third-party
ownership is modelled, which the previous KYC did not do at all: owner
name, contact and signed authorisation, because riders commonly use a
vehicle they do not own.

A trap was found and closed inside that flow: it had been parking a
`pendingChange` object holding R2 photo URLs inside the driver's
`vehicleDetails` jsonb column, so **every customer tracking a delivery
would have received links to a compliance submission still under
review.** `redact-driver.ts` now narrows `vehicleDetails` to named
fields.

**The QR is the missing link, and it is load-bearing.** The liability
matrix transfers responsibility on scans at every boundary. Without
scannable codes no handoff can be recorded, which is exactly why the
disputes page was empty. It is not a nicety, it is the mechanism that
makes the deck's central claim true.

---

## The crashes, and what they cost

Two unclean shutdowns. The second corrupted **eight files** in a way that
is easy to misread: they kept their byte size but the data was never
flushed, leaving pure whitespace with **not one newline**. That is why
`nest build` was dying with a V8 OOM even at a 4GB heap: the compiler was
thrashing on files whose imports resolved to nothing.

`deliveries.service.ts` alone was 193KB of garbage. All eight were
recovered from `HEAD`.

**Cost:** the previous agents' chain-of-custody work in `identity/` and
`partner-store/`, and the cancellation-pay wiring. All of it has since
been rebuilt except the cancellation-pay change, deliberately held back
so a module-graph edit does not share a deploy with anything else.

**Lesson worth keeping:** `wc -l` returning 0 on a file with content
means no newlines, which means corruption, not an empty file. And a
wrapper's exit code is not the tool's exit code: `npx nest build | tail`
reports `tail`'s status. That mistake hid a corrupted `.next` cache
earlier and a real `tsc` failure later.

---

## Waiting for the phone

- **Driver APK built.** `BUILD SUCCESSFUL in 1h 11m`, 214MB, background
  location compiled in
- **Business APK building**
- Both install in a couple of minutes on plug-in, then Metro serves the
  JS

## Still open

- The cancellation-pay wiring, held back deliberately
- Partner and driver apps do not yet prompt for a typed signature on the
  two auto-recorded stages; those land as `signatureSource: 'account'`
  until they do. The wire fields are optional so nothing breaks
- **Nothing in this session ran against a live delivery.** The custody
  self-heals (`ALTER TYPE`, `ADD COLUMN`) are unverified against real
  Postgres. The first business trip is the real test
