# Night work order, 24 August 2026

Native-layer work. Everything here needs a **full native Android rebuild**
(`npx expo run:android`) per app, not a Metro bundle. None of it can be
hot-reloaded, and each rebuild reinstalls the app and wipes its session,
so plan the logins.

Founder instruction: log this for tonight, for every app that needs it.

---

## 0. DO THIS FIRST: driver bank details and home address leak to customers

**Severity: highest thing on this page.** Not a bug, a data exposure.
Live in production right now. Found 2026-08-24 while checking why the
customer's live-coordinate block was empty.

`GET /deliveries/:id`, called by the customer app on every delivery
detail and tracking view, returns the **raw Driver entity with its full
User relation attached**. No redaction. Verified against production with
an ordinary customer token on delivery `SRS-9CJ7LJP2`.

What the customer's phone receives about their rider:

| Field | What it is |
|---|---|
| `bankAccountNumber`, `bankAccountName`, `bankCode` | The rider's bank account |
| `homeAddress` | Where the rider lives |
| `dateOfBirth` | |
| `phone`, `email` | Beyond what the trip needs |
| `emergencyContactName`, `emergencyContactPhone` | Their next of kin |
| `fcmToken` | Push token. Anyone holding it can push notifications to that rider's device |
| `nationalIdFrontUrl`, `nationalIdBackUrl`, `driversLicenseUrl`, `guarantorUrl`, `insuranceCertUrl`, `ownershipProofUrl`, `selfieUrl`, `vehicleDocumentUrl` | KYC document URLs. Null on the demo rider, populated on any real approved one |
| `walletBalance`, `valueLevel` | Internal, and `valueLevel` was already flagged separately |
| `failedLoginAttempts`, `lockedUntil`, `passwordResetExpiry` | Account security state |

The KYC fields being null on the demo account is luck, not safety. Every
approved rider has them filled, so this gets worse the moment real riders
are onboarded.

**The correct shape already exists elsewhere.** The public tracking
endpoint `GET /deliveries/track/:code` returns exactly six driver fields:
`name`, `rating`, `vehiclePhotoUrl`, `vehiclePlate`, `vehicleType`,
`verifiedPro`. Someone got this right once and the authenticated route
never received the same treatment.

**Work:**
1. Redact the driver on `findByIdForUser` and every route that serves a
   delivery to a customer or a business. Whitelist, never blacklist: a
   blacklist silently leaks the next field anyone adds to the entity
2. Add `lastLat`, `lastLng` and `locationUpdatedAt` deliberately, because
   the customer legitimately needs those and it fixes the separate
   fallback gap below
3. Check the mirror case: what the DRIVER receives about the customer.
   `redactCustomerForDriver` exists (sweep D-7.6) but has not been
   re-verified since
4. Check the business and partner delivery routes for the same shape
5. Test with a real customer token afterwards and assert the driver
   object has only the whitelisted keys

**Also fix while in there:** the customer app waits for a websocket
position and shows nothing when none arrives, which is why the live
coordinates looked missing when the driver app was backgrounded. The REST
payload already carries `lastLat`, `lastLng` and `locationUpdatedAt`.
Fall back to those and say "last seen N minutes ago" rather than hiding
the block entirely, so a customer can tell the difference between a quiet
rider and a missing feature.

---

## 0b. Driver status broadcast reaches nobody

Verified live on device 2026-08-24: the founder tapped "Stuck in traffic"
and confirmed the dialog; the customer's notification count stayed at 58
and nothing appeared on their Notifications screen.

Two faults stacked:

1. `drivers.service.ts` saves the broadcast row then calls
   `trackingGateway.broadcastDriverStatus(...)` and stops. It is a live
   socket event only, and never writes a `Notification`. If the customer
   app is not open on the right screen at that second, the message is
   gone permanently
2. The driver screen calls `driversApi.sendStatusBroadcast({ type })`
   with **no `deliveryId`**. The handler binds the delivery only
   `if (body.deliveryId)`, and its own comment says that without it the
   broadcast is "scoped to the admin room only". So it never even reached
   the delivery room

The rider is told it sent. That is the worst part: they believe their
customer has been informed.

**Work:** pass the `deliveryId` from the driver screen, and persist a
notification alongside the socket event so it survives a closed app.
Backend plus one line in the app, so it needs a deploy.

**Same screen:** "Stuck in traffic / I'm moving slowly: ETA may extend"
is an arrival-time promise and breaks the no-ETA rule. Reword.

---

## Do this first, before any rebuild

`SRS-9CJ7LJP2` is still open and still owes a proof photo. Rebuilding the
driver app reinstalls it and drops the session, and reaching that screen
again costs a fresh paid booking. **Close the delivery out on the build
currently installed**, which has every fix from today and is verified
working on device.

Also outstanding and independent of any rebuild: backend and admin have
never been deployed today. The SOS tab, the four dead notification
features, the `driver-compliance` 500 and the cancellation pay bug are
all fixed locally and all still broken in production.

---

## 1. Background location, driver app

**Why:** the whole live-tracking chain was verified working today with
real hardware GPS (a genuine Berlin fix travelled phone to backend to
customer screen). But `startBroadcast` calls
`requestForegroundPermissionsAsync` only, so sampling stops the moment
the rider pockets the phone or the screen locks. That is how an okada
rider carries a phone, so in practice tracking dies on nearly every real
delivery, and the customer keeps watching a frozen pin and believes it.

A tracking feature that silently freezes is worse than none.

**Already done, no action needed:** `app.json` is fully configured.
`isAndroidBackgroundLocationEnabled` and `isIosBackgroundLocationEnabled`
are true, and `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE` and
`FOREGROUND_SERVICE_LOCATION` are all declared. Someone set the
permissions up and never wired code to them.

**Note the Play Store risk in the current state:** Google rejects apps
that declare `ACCESS_BACKGROUND_LOCATION` without demonstrably using it.
Today the driver app asks riders and Google for a permission it never
touches. Either wire it or drop the declaration; leaving it as-is is the
one option that fails review.

**Work:**
1. `npx expo install expo-task-manager` (not currently a dependency in
   any of the three apps)
2. Define the task at module scope, outside the component, or it will not
   survive the app being killed
3. Replace `watchPositionAsync` with `startLocationUpdatesAsync`, keeping
   today's sampling policy: 250m `distanceInterval`, 30s floor, 10 minute
   ceiling for a stationary rider (founder-approved 2026-08-24)
4. `foregroundService` config with wording riders will accept. Android 10
   and up force a persistent notification saying SEIRS is using their
   location, and riders distrust it if it reads like surveillance. Say
   what it is for: the customer is watching this delivery
5. Call `requestBackgroundPermissionsAsync` at the right moment, which is
   when a rider accepts their first job, never at app launch. Android
   shows a second, scarier dialog for "Allow all the time" and asking
   cold gets it denied
6. `stopLocationUpdatesAsync` on delivery completion, cancellation and
   going offline. A task that outlives the delivery drains battery for
   nothing and tracks a rider off shift, which is a real privacy problem
7. Rebuild, reinstall, verify on device the same way as today: park a
   known-wrong coordinate on the server first, then lock the phone, walk,
   and confirm a real fix overwrites it while the screen is off

**Cost:** no money. Device GPS and the mobile Maps SDK are both free, and
the metered Google APIs (Directions, Places, Geocoding) are untouched by
this. The costs are rider battery, a little rider data, and Play Store
review time on the background-location justification.

---

## 2. Push notification config gaps

Found while auditing the three apps for native work.

| App | `expo-notifications` dep | config plugin | calls `usePushRegistration` |
|---|---|---|---|
| customer | yes | yes | yes |
| driver | yes | **no** | yes |
| business | **no** | **no** | yes |

**business-app is the broken one.** Its `_layout.tsx` calls
`usePushRegistration` while `expo-notifications` is absent from its
`package.json` entirely. It works on this laptop only because the
monorepo hoists the package from the other two apps. In a clean EAS
release build the native module is not linked for business and push dies
silently, which is the classic works-in-dev-breaks-in-release failure.

**driver-app** has the dependency but no config plugin. On Android the
plugin is what sets up the notification channel and icon, so job-offer
pushes may arrive looking wrong or not surface properly. For a driver app
push IS the job offer, so this is not cosmetic.

`google-services.json` is present in all three, so FCM itself is wired.

**Work:** add `expo-notifications` to business-app dependencies, add the
config plugin to both driver and business `app.json`, then rebuild both
and verify a real push lands on each with the app backgrounded.

---

## 3. Not needed, checked and confirmed

- **Customer and business background location:** neither should have it.
  Both correctly declare foreground location only. Senders and recipients
  do not broadcast position, only riders do. Leave as-is
- **`expo-task-manager` in customer or business:** not needed, they run no
  background tasks

---

## 4. Replace 300 native OS dialogs with a themed one

**Not native work.** Pure JavaScript, so this needs no rebuild and can be
bundled and reloaded like any other change. It can run alongside the
rebuild work above rather than waiting for it.

**Why:** the founder found it on device 2026-08-24, on the Report a
problem dialog: "why does this have this grayish unstylied background and
the green words, seems like less effort design, and i have seen it around
the entire app".

Correct on all counts. `Alert.alert()` is not a component anyone designed:
it is React Native calling the Android system dialog. The grey surface and
teal uppercase buttons are Android's theme, and React Native exposes no
control over background, font, corner radius, button colour or layout. So
the SEIRS design system simply stops at the edge of that box, on every
Android phone.

| App | `Alert.alert` calls |
|---|---|
| customer | 105 |
| driver | 108 |
| business | 87 |
| **total** | **300** |

Three of those were added on 2026-08-24 while fixing other things, which
is exactly how it reached 300: it is one line and it works.

**The sharpest example:** "Report a problem: what is wrong with this job?"
is a core step in the failed-delivery design, not an error message. A
rider reporting a problem lands in a raw OS dialog, while a customer
reporting the same problem gets the properly designed "Wrong address?"
sheet. Same product, same event, two different levels of care.

**Work:**
1. Build `SeirsDialog` in `shared/components`: themed surface, app
   typography, kobo-correct where money appears, light and dark, a
   destructive variant, and a real touch-target size for gloved thumbs
2. Export it through each app's component barrel. New shared exports must
   be added to every consuming app or the import silently resolves to
   undefined and the app red-screens at runtime
3. Migrate in priority order, not all at once:
   - **Tier 1, roughly 20:** dialogs a user meets during a normal
     delivery. Report a problem, nobody available to receive, cancel
     confirmations, arrival issue, proof-photo permission
   - **Tier 2:** destructive confirmations, where styling carries the
     weight of the warning
   - **Tier 3:** plain error messages. Optional. An error looking like an
     OS error is defensible, so this tier can stay native if time is short
4. Typecheck each app after each tier, and drive tier 1 on device: these
   are decision dialogs, so a broken button here blocks a delivery

**Watch for:** `Alert.prompt` is iOS-only and silently does nothing on
Android. Any migration that finds one has found a bug, not just a styling
issue.

---

## 5. Light-mode audit: 52 hardcoded translucent colours

**Not native work.** JavaScript only, no rebuild.

**Why:** the founder switched the driver app to light mode on 2026-08-24
and the ACTIVE JOB card was the only murky element on a screen of clean
white cards, with what looked like a second grey box nested inside it.

One line caused both: `backgroundColor: '#16A34A15'`, green at roughly 8%
alpha. Over near-black that is the subtle glow it was designed to be.
Over the cream light background it is grey-green sludge. The phantom
nested box was the same cause: `Shadows.md` puts Android elevation on the
view, and elevation behind a translucent background shows through
unevenly, reading as a second surface.

Fixed on that card by branching on `isDark`, which was already available
in the file. But it is one instance of a pattern:

| App | Hardcoded low-alpha hex colours |
|---|---|
| customer | 17 |
| driver | 20 |
| business | 15 |
| **total** | **52** |

Every one of those is a colour chosen while looking at one theme. Some
will be harmless, some will be the same sludge, and none of them can be
told apart without looking.

**Work:**
1. Enumerate all 52. `grep -rhoE "'#[0-9A-Fa-f]{6}(0[0-9]|1[0-9]|2[0-9])'"`
   over each app's `app/` directory finds them
2. For each, open the screen in **both** themes before deciding. The rule
   is not "replace them all": a translucent overlay on a photo or a map
   is usually correct in both
3. Where it is a card or surface colour, branch on `isDark` or move it to
   a theme token. Prefer the token: a branch at every call site is how
   this happened
4. Watch specifically for translucent backgrounds combined with
   `Shadows.*`, which produces the phantom-box artifact regardless of
   theme
5. Drive each app in light mode on device afterwards. This class of bug
   is invisible in code review and obvious on a screen

**Note:** dark mode is the default and where all the work has happened, so
light mode is the under-tested theme across all three apps. Worth a
dedicated pass rather than only checking the 52.

---

## 6. Package QR, all apps (founder priority, build tonight)

**No rebuild needed.** `react-native-qrcode-svg` is already a dependency
in all three apps, and the customer app already renders QR on its SEIRS
ID screen. Pure JavaScript, ships by bundle reload.

**Why the founder wants it, in his words (2026-08-24):**

> "its asthticaly pleasing to people and that alone would make more
> people want to use our apps, just like people who have their phone in
> their pocket but will still use their watch to pay using nfc... humans
> like to show off"

That is an adoption argument, not a decoration argument, and it should
shape the design: the QR screen is something a sender *wants* to
screenshot and send. Make it worth screenshotting.

**And the security argument, which is the stronger one.** The handover
sheet's three options are not equally trustworthy:

| Option | Evidence behind it |
|---|---|
| The recipient | Self-attested. The rider asks, a person says yes |
| Someone else + typed name | Self-attested, plus a name nobody checks |
| **Scan package QR** | **The person at the door holds a code the sender gave them** |

The QR is the only handover option with a chain of custody. Founder:
"the other could be like yes thats my name etc, more reason for it to
work."

**Today's dead end:** the driver's scan screen says "Ask the customer to
open their tracking screen and tap Show package QR". A grep for that
string across the entire customer app returns **zero matches**. The
button was never built, so the rider is sent to ask for something that
does not exist.

**The second problem the founder identified:** the receiver is usually
NOT the sender and usually does not have SEIRS installed. On
`SRS-9CJ7LJP2` the sender was in Berlin and Tunde was at a gate in
Akobo. So the QR must survive being screenshotted and sent over
WhatsApp, and it must not be the only path.

### What to build

**Customer app**, on the tracking screen and the trip detail:
1. A "Show package QR" action
2. A screen designed to be screenshotted: the QR large and centred, the
   tracking code in text beneath it, the package description and the
   receiver's name, SEIRS branding. Something a sender is happy to send
   to their receiver
3. Copy on the code, and a Share that sends the code as text for
   receivers who cannot handle an image
4. The QR encodes the tracking code and nothing else. No personal data
   goes into a code that will be screenshotted and forwarded

**Business app**, the same, per package. Multi-package runs give every
package its own public tracking code, so each needs its own QR rather
than one for the run.

**Driver app:**
5. Make manual code entry a first-class control on the scan screen, not
   a hidden fallback. A rider with a cracked lens, a dark doorway or a
   receiver holding a cheap phone still needs to complete the handover
6. Fix the fallback guard. It wraps `require('expo-camera')` in a
   try/catch, but the monorepo hoists that package to the root
   `node_modules`, so the JS always resolves and the guard always passes.
   Detect the missing NATIVE module, or simply always offer manual entry
   beside the scanner
7. Order the handover sheet by strength: QR first as the recommended
   path, then The recipient, then Someone else

**Not a blocker, worth knowing:** the black preview seen on 2026-08-24
was the phone lying face-down on a table, not a camera fault. Do not
chase it.

---

## Suggested order

1. Founder closes out `SRS-9CJ7LJP2` with the proof photo, on the current
   build
2. Push backend and admin (no rebuild involved, unblocks the SOS tab and
   the four dead notification paths)
3. **Dialogs, tier 1** (item 4). No rebuild needed, so this can start
   immediately and land by bundle reload while the rest waits
4. Driver app: task-manager, background location, notifications plugin.
   One rebuild covers all three
5. Business app: notifications dependency and plugin. One rebuild
6. Device verification of both, screen locked, walking
7. **Dialogs, tiers 2 and 3** as time allows

Items 3 and 7 are JavaScript only and can be interleaved with the
rebuilds, since a native build occupies the machine but not the editor.

Driver and business each need their own native rebuild. Do them one at a
time: three Metro instances minifying at once has already killed two of
them on this laptop.

---

## Noticed while walking the apps, logged not fixed

Found on device 2026-08-24 during the founder's design pass. None are
urgent; all are real.

- **Business dashboard hero card renders a large empty block.** The
  "COMING SOON / Send many packages in one run" slide has roughly 250px
  of blank space above its text where an image should be. Either the
  asset is missing, the URL is dead, or the card reserves image height it
  never fills. First screen of the app, so it reads as broken
- **Driver Withdrawable shows a dash offline, `NGN 0.00` online.** Same
  card, same zero, two renderings. A dash where money belongs makes a
  rider think their earnings vanished. Pick one and use it in both states
- **`Alert.prompt` is iOS-only** and does nothing at all on Android.
  Worth a grep during the dialog migration: any hit is a dead feature,
  not a styling problem
- **Distance appears twice on the driver's Active Delivery**, once in the
  map stat row and once in Package Details. Harmless, but it is the kind
  of duplication that made the screen four pages long
- **Business app is the least walked of the three.** Its bundle was built
  for the first time on 2026-08-24 at 62s, and only the dashboard and the
  Wallet tab have been opened on device. The new live tracking added the
  same day has never been seen running

**Checked and NOT a problem, so nobody re-opens it:** the business Wallet
tab. The label is `isPartner ? 'Wallet' : 'Rewards'` and the screen shows
rewards points plus, for approved partners only, what SEIRS owes their
store with weekly settlement to a business bank account. Nobody deposits
money. Founder confirmed the design is intended (2026-08-24).

---

## Carried over from today, not native, not yet done

- Booking says "Keke" while the assigned rider is on a motorcycle
  (`vehicleType: motorcycle`, Bajaj Boxer). Pricing question as much as a
  label: keke and okada carry different rates
- `valueLevel` sits in the driver's own `/drivers/me` payload
- Chevron inconsistency on the customer failed-delivery cards: "Recipient
  not available?" has one, "Wrong address?" and "Need it back?" do not,
  though all three open sheets
- `serviceFees` still zero on the active rate card, awaiting a founder
  decision on the amount
- Three register items needing new backend routes: trunk-check photo
  (`POST /deliveries/:id/driver-note`), single transaction fetch
  (`GET /earnings/:id`), and `firstName`/`lastName` on `RegisterDto`
