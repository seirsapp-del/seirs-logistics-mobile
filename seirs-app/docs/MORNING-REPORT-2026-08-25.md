# Morning report, 25 August 2026

Written overnight while the founder slept. Updated as work landed, so
the bottom sections may be thinner than the top.

**Read this first:** nothing below has run on a device unless it says so
explicitly. Three agents worked one-app-each so they could not overwrite
each other, and every one of them typechecked clean, but a typecheck is
not a screen.

---

## The single most important thing

**Your riders' bank account numbers and home addresses were being sent to
their customers.** Fixed in code overnight, **not yet deployed**.

`GET /deliveries/:id` and the business equivalent returned the raw Driver
entity with its full User relation attached. `Delivery.driver` is eager,
`Driver.user` is eager, and nothing whitelisted the result. Verified
against production with an ordinary customer token, on the founder's own
delivery.

What a customer's phone received about their rider: `bankAccountNumber`,
`bankAccountName`, `bankCode`, `homeAddress`, `dateOfBirth`, `email`,
`emergencyContactName`, `emergencyContactPhone`, `fcmToken`, every KYC
document URL (`nationalIdFrontUrl`, `driversLicenseUrl`, `guarantorUrl`
and the rest), `walletBalance`, `valueLevel`, and account lockout state.

Nobody decided to share that. It happened as a side effect of two `eager`
decorators, and it would have grown with every column added to either
table.

**Fix:** one shared whitelist at `src/common/redact-driver.ts`, used by
both the customer route and the business route so the two cannot drift.
Whitelist, never blacklist: a blacklist leaks the next field anyone adds,
which is exactly how this happened. The rider keeps their name, photo,
plate, vehicle, rating and phone, because drivers are always fully
identified to their customer. Identified is not the same as exposed.

**Checked and clean:** the delivery LIST route does not leak. It uses a
QueryBuilder, and TypeORM ignores `eager` on QueryBuilder. Verified
against production, not assumed.

**Still needed:** a deploy. This is the main reason to push this morning.

---

## Three dialogs were silently deleting options, and all three mattered

Android's `AlertDialog` renders **only the first three buttons** and
discards the rest with no error, no warning and no log line. React Native
passes the whole array and never mentions it.

| Where | Buttons | What was invisible |
|---|---|---|
| Driver, cancel job | 6 | **"I feel unsafe"**, the one reason your own copy says never counts against a rider's allowance. Plus "This is actually a package / a person" and "Customer unreachable" |
| Driver, report a problem | 5 | **Cancel** (the founder was trapped by this live) and **"Unsafe or refused item"** |
| Driver, who received it | 4 | **"The recipient"**, the way almost every delivery ends |
| Customer, Travel Buddy seats | up to 5 | On any trip with 3+ seats free: "3 seats", "4 seats" AND Cancel. **An Android customer could not buy more than two seats, and could not back out** |
| Customer, rewards redeem | 4 | `slice(0, 3)` was one over because Cancel counts too, so **a customer with three active deliveries could never pick the third** |
| Business, appearance | 4 | Cancel, so the theme picker could not be dismissed from the screen |

The rider-safety one is the worst: **a rider who felt unsafe could not say
so.** They had to continue, or choose a reason that penalised them.

Two of these are also money: Travel Buddy could not sell three seats, and
rewards could not redeem against a third delivery.

**All rescanned after migration: zero 4+ button dialogs remain in driver
or customer.**

---

## Package QR, built in all three apps

Founder priority, and it works because the formats were checked rather
than assumed: the customer QR encodes the bare tracking code, and the
driver scanner does `scanned.trim().toUpperCase() === expected`. A match.

- **Customer:** new `package-qr.tsx`, laid out as a ticket worth
  screenshotting. Reachable from the tracking screen and, per package,
  from the trip detail, because a multi-package run gives every parcel
  its own public code and one QR per run would let any receiver claim any
  parcel
- **Business:** same, per package
- **Driver:** manual code entry is now a permanent card in every state,
  never gated on the camera. The old fallback guard tested whether the
  JavaScript loaded, which always succeeded because the monorepo hoists
  `expo-camera` to the root `node_modules`
- **Handover sheet reordered by evidential strength:** Scan QR first,
  then The recipient, then Someone else. The last two are self-attested;
  the QR proves the person at the door holds a code the sender gave them

**The ticket is deliberately paper-white in both themes.** Scanners read
dark-on-light far better, and the hard case is a cheap phone reading a
WhatsApp-compressed screenshot in a dark doorway.

**The QR encodes the tracking code and nothing else.** It is designed to
be forwarded to strangers, so nothing personal goes inside it.

---

## Text that was literally unreadable

Not ugly, unreadable. Contrast measured, not eyeballed:

| Where | Was | Now |
|---|---|---|
| Customer, Verified badge | **1.96:1 on dark**, and dark is the default | 9.86 / 7.02 |
| Customer, tier pill medal | **1.56:1 on light** | 9.29 / 4.69 |
| Customer, receipt date | **1.66:1 in every theme** | 4.99 / 7.22 |

Deliberately left alone: the pale info tints and icon badges that read
correctly in both themes. The rule applied was "check it in both before
touching it", not "replace every translucent colour".

---

## Smaller things, all verified on device yesterday

- Driver "Withdrawable" showed a dash offline and `NGN 0.00` online.
  Money now always renders as money, and a failed refresh keeps the last
  known figure and says "Not updated, no connection" instead
- The completion dialog hardcoded "clears in 2 business days" while the
  API reports `clearanceBusinessDays: 0`. It now reads the real value,
  and says "already cleared and ready to withdraw" when that value is
  zero, because "clear in 0 business days" is not English
- "I'm moving slowly: ETA may extend" is gone, replaced with "Held up on
  the road, still on my way". No arrival-time promises anywhere

---

## Known and NOT fixed

- **The status broadcast still reaches nobody.** Verified live: the
  founder tapped "Stuck in traffic", confirmed the dialog, and the
  customer's notification count stayed at 58. It fires a websocket event
  only, never persists a notification, and the driver app sends no
  `deliveryId`, so it is scoped to the admin room. The rider is told it
  sent. Backend plus one app line; needs a deploy
- **Background location.** Tracking is foreground-only, so it stops the
  moment a rider pockets their phone. Needs a native rebuild
- **`expo-notifications` missing from business-app `package.json`** while
  its layout calls `usePushRegistration`. Works today only because the
  monorepo hoists it; in a clean release build push dies silently. Needs
  a native rebuild
- **41 register items** still open: 15 admin, 13 driver, 10 website,
  2 customer, 1 business

---

## Verified on your phone overnight

All three apps were rebuilt with every overnight change, relaunched, and
checked for JS errors. **None crashed.** What was confirmed by looking at
the screen, not by reading code:

| | |
|---|---|
| Customer app | Launches clean, no JS errors |
| **Proof of delivery photo** | **Renders.** Both "WHAT YOU SENT" (the lasagna) and "PROOF OF DELIVERY" (the handover shot) now show on the customer's screen. This morning you could see neither, despite paying for the delivery and taking one of the photos yourself |
| Driver app | Launches clean, no JS errors |
| **Withdrawable** | **NGN 1,469.68**, with "Today NGN 1,469.68". Real earnings from the completed delivery, and the dash bug is gone |
| Rating | 4.9 · 214 trips, holding |
| Business app | Launches clean, no JS errors |
| **Hero badge** | Reads **"NEW"**. You are no longer advertising multi-package as unreleased |
| **Hero image block** | The okada watermark fills what was an invisible hole |
| Admin dashboard | Pushed to production, commit `3bcc69e`. Build was green (37 min, machine was saturated) |

**The package QR could NOT be verified on device.** Not a failure: the
QR entry point is correctly hidden on a completed delivery, and
`SRS-9CJ7LJP2` is now delivered, so there was no active booking to render
it on. Its first real test is your business trip.

What WAS verified about the QR is the part that could have silently made
it useless: **the payload contract matches.** The customer encodes the
bare tracking code; the driver scanner does
`scanned.trim().toUpperCase() === expected`. Confirmed by reading the
consumer, not assumed.

## Native rebuilds: deliberately NOT done, and why

You approved these "if you get through everything". I did not get through
everything, and the trade got worse the closer I looked.

Both remaining native items (background location on driver,
`expo-notifications` on business) require `npx expo run:android`, which
**reinstalls the app and drops its session**. You need BOTH apps working
at 9am: the business app to book, the driver app to deliver it.

A native build on this machine takes 15 to 30 minutes and can fail in
ways that leave an app uninstalled. The only gain would be push
notifications and background GPS, neither of which you will exercise in a
morning trip where you are holding both phones yourself.

So: two working apps beat two theoretically better apps. The rebuilds
want you awake and not about to demo. `package.json` and `app.json` are
already updated for business, so the rebuild itself is now a single
command whenever you want it.

## The honest caveat

The riskiest thing in here is not any single change, it is that **a large
amount of code changed overnight and none of it has been driven on a
phone.** Highest-risk items to try first:

1. The driver scan screen, which was restructured
2. The new dialog sheets, especially any that navigate on dismiss
3. The customer QR screen and its two entry points
4. Anything on business-app, which has the least mileage of the three and
   is about to get its first real trip
