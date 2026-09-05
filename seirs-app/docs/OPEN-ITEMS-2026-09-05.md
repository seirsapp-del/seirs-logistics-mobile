# Open items after the night of 4-5 September 2026

Everything below is real, none of it is speculative, and none of it is
deployed. Nineteen commits sit on `main` unpushed. Sorted the way the
founder asked for it: what needs **testing**, what needs a **design**
decision, and what needs a **flow** change.

A push would deploy **twenty** commits, not nineteen: `origin` also holds
`c0ceff74`, which production has never run (it still reports `d96276f`).

---

## A. FLOW CHANGES (broken journeys, fix these first)

### A1. The Send flows do not catch `SPECIAL_REQUEST_REQUIRED`
**Severity: highest. Smallest fix on this page.**

`computePrice` now throws `SPECIAL_REQUEST_REQUIRED` for `special`,
`oversized`, `heavy`, `hazardous`, `cold_chain`, `livestock` and
`relocation`, deliberately before the zone guards so it cannot be reached
by luck. Neither the customer nor the business Send flow catches it.

- **What a user sees today:** an oversized load produces what looks like a
  price failure, as though the app is broken.
- **What should happen:** "This one needs a quote", and a tap into the
  special-request form.
- **Consequence:** the entire quote-first lane is reachable only by
  somebody who already knows the screen exists.

### A2. Accepting a quote does not create the Delivery
Accept records the acceptance, marks the quote accepted and moves the
request to `accepted`. `deliveryId` stays null.

- **What a user sees today:** "We are assigning" and then nothing. No
  payment, no matching, no tracking, no chat.
- **Why it was left:** creating the Delivery must go through the real
  booking path or we get a delivery row that payment and tracking do not
  recognise. That is worse than a missing step.
- The column exists and the seam is clean.

### A3. Special requests have no list surface
A sender can submit one and reach the detail screen, but nothing in
Bookings or Recent Trips lists their open requests. If they close the app
after submitting, they have no route back except the deep link.

---

## B. TESTING (none of this has been seen running)

**The honest headline: almost nothing from that night has been driven on
a screen.** It compiles, it type-checks, the schema self-heals on boot.
That is not the same as watching somebody use it, and the sharpest defect
of the day was a screen that told a shopkeeper the opposite of what the
code did. It compiled fine and deployed fine.

### B1. Needs the phone, no deploy required
- Declare a trip from an **Ile-Ife** address: the city must read Ile-Ife,
  not Kajola.
- Declare from **Olorunda Aba Market, Ibadan**: must read Ibadan, not Aba.
- Travel Buddy and Cargo Space: four labelled fields, city suggestions,
  swap, month calendar, seat/weight control.
- "Use my location" on each field.
- Customer Rewards: the seven-day chart.
- Business Wallet: Rewards for a sender, Wallet for a partner, seven-day
  chart on both.
- Partner Earnings: the PAID INTO row routes to `payout-account`.
- Google and Apple buttons on all three login screens. Apple renders on
  iOS only and there is no iOS build, so expect it to be absent.
- Special-request form and quote screen, customer and business.
- Business `trip-requests`: the `Navigation` icon now renders.
- **Download my data** produces a PDF with the new letterhead.

### B2. Needs the one deploy first
- Search **Ife to Ibadan** and find the declared trip (address-text and
  distance matching).
- Trip card shows vehicle class only: no plate, no photo, no exact address.
- Empty search offers "alert me", and the alert fires when a driver
  declares that route.
- Driver accepts a seat, then cannot edit the trip.
- Admin: support queue views, twelve date boards, parcel negotiations,
  both trip boards, the special-request queue.
- Both data leaks closed: `priceBreakdown` on business deliveries, and the
  partner settings row.

### B3. Needs a native build (nothing else does)
- **The navigation bar in dark mode.** The only native change outstanding.
  Confirmed in the generated theme
  (`enforceNavigationBarContrast` now `false`), carried by no successful
  build yet: three failed, two on memory exhaustion and one on the release
  bug.

### B4. Needs real money
- Does Flutterwave return its own processing fee on a refund, or charge on
  both legs? `refundEscrow` asks for the full amount charged and their fee
  policy is invisible to us. Measure gross debited, amount credited back,
  and fees on BOTH legs. This matters more now the no-rider wait is 10
  minutes rather than 60, which turns refunds from rare into routine.

---

## C. DESIGN DECISIONS (judgement calls made while he slept)

Each is cheap to reverse. None is a defect.

1. **Google and Apple buttons use each company's brand colours, not our
   theme.** In dark mode the white Google button is a bright block. It is
   the platform standard and people recognise it on sight, but it is the
   most likely thing to jar.
2. **Rewards bars carry no number above each bar**, unlike the driver's
   earnings chart. Points are 4-5 digits where the driver's are naira, so
   seven labels across a phone would overlap. Totals are stated underneath
   instead.
3. **No weekly goal on Rewards**, though the driver has one. A
   customer-side goal programme is a parked founder decision, not an
   omission.
4. **A fourth card on Partner Earnings** (PAID INTO). It answers the
   question that screen provokes, but the business app is meant to be the
   restrained one.
5. **The trip search card stays open after searching**, pushing the first
   result near the fold on a small phone. The alternative is collapsing it
   to a summary line, which is one more state to get wrong.
6. **The okada mark changed on every screen that draws it.** The apps were
   drawing a thinner one than the launcher icon. It is now correct, and it
   will still look different from what he has been seeing for months.

---

## D. CONFIGURATION AND HOUSEKEEPING

- **Fee Catalogue values still shortened for testing:**
  `corridor_min_lead_minutes` 5 -> 180,
  `dispatch_warn_after_minutes` 5 -> 10,
  `pending_booking_expiry_minutes` 10 -> 30,
  `travel_buddy_offer_timeout_min` 5 -> 30.
- **`corridor_max_lead_days` vs the 30-day calendar.** If drivers cannot
  declare that far ahead, the far end of the strip promises days nobody
  can fill.
- **Railway egress is dynamic** and Flutterwave whitelisting needs a fixed
  address. Last observed `50.18.224.108`.
- **Play Store signing key.** Local release builds are signed with the
  DEBUG keystore. Fine for sideloading, not acceptable for Play, and once
  a package is published under a key that key can never change. Decide it
  deliberately.
- **`EXPO_NO_METRO_WORKSPACE_ROOT`** is the one-line fix for local release
  builds, and it is **unverified**: the diagnosis was read, not observed.

---

## E. THE PATTERN WORTH CARRYING FORWARD

Six times in one night, across two sessions, the same shape: **a mechanism
that ran, reported success, and measured the wrong thing.**

| Where | What it did instead |
|---|---|
| `.catch(() => {})` on the nav bar | Swallowed a platform refusal for three rounds of "fixing" |
| Support queue sort | Applied after the list was already truncated |
| A process check | Matched its own command line and counted itself |
| The trip-edit guard | Read a counter that only moves on payment |
| A config read | Called a service that was never injected, so it silently used the fallback |
| Every APK ever built here | Real and installable, and silently dependent on a laptop in Berlin |

The last one is the finding to carry into today. Not a bug in anything
written that night: a check that had been passing for months without
measuring anything.

The practical rule that falls out of it: **when something reports success,
ask what it would have said had the thing been broken.** If the answer is
"the same", it is not a check.
