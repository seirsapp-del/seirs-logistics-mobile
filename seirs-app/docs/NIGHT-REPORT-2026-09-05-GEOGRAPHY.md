# Night report, 5 September 2026: a place is a point, not a word

Read this first. **Ten commits, nothing pushed, nothing deployed.** The
production API is exactly where the payment tests left it.

A push tonight would deploy ELEVEN commits, not ten: origin also holds
c0ceff74, which production has never run (it still reports d96276f). So a
push ships an untested commit alongside ours. Neither session pushes.

```
385df60b  feat(driver): show the rider what the shop looks like
15bd10b8  feat(rewards+earnings): show the week, and where the money lands
234efd1a  feat(brand+auth): one okada everywhere, a nav bar that obeys, sign-in buttons
fb8c6027  fix(driver): move the JSX comment out of the conditional
e0bc9e36  fix(driver): the uncertain-city notice stopped explaining the wrong thing
9c66d7d8  test(geo): the city derivation, checked against addresses that occur
a22cc4ca  docs(night): the geography pass, the rebuild audit, and a map that stopped lying
bac498d3  feat(geo): a place is a point, not a word somebody spelled right
e00c46c2  fix(send): ask how to find the spot, and let a night trip be edited
```

## What started it

Two failures on the device, hours apart, that turned out to be the same
bug:

| What was picked | What it was filed as | What it should have been |
|---|---|---|
| Obafemi Awolowo University | **Kajola**, an LGA in Oyo | Ile-Ife, Osun |
| Olorunda Aba Market, Ibadan | **Aba**, a city in Abia | Ibadan, Oyo |

Trip discovery matches on that name. So a driver declared Ile-Ife to
Lagos by way of Ibadan, and a passenger searching **Ife to Ibadan** was
told "No trips on this route yet". The trip existed, was bookable, and
was invisible to the exact person it was declared for. The business
app's Cargo Space shares the endpoint, so a sender could not see it
either.

The search code was not at fault. It already matched intermediate stops
rather than only endpoints, and it already used `ILIKE '%...%'`. It
failed because it compares against `trip_stops.city`, and that column
said "Kajola".

## What was built

**The geography, as data.** `shared/models/nigeria.ts` carries all 37
states and all **774 local governments**, each state declaring its own
count beside its list. `verifyGeography()` checks that the counts match
and that they sum to 774, so a dropped or duplicated name fails a check
instead of quietly becoming a town nobody can find. It passes.

**One derivation, replacing four copies.** The customer, business and
driver `StreetAutocomplete` components and the driver's trip builder all
carried an identical `locality -> LGA -> sublocality` read. They now
call `derivePlace()`, which prefers a known city standing as its own
comma-part of the address, rejects a name that is a local government,
and reports `confident: false` rather than inventing an answer. Nine
cases pass, including both device failures and the traps a naive scan
would hit: "Aba" must not match inside Abakaliki, "Ife" must not match
inside Life Camp, and a real Aba address must still be Aba.

**Distance matching.** `browseTrips` now also matches stops by
coordinates when the search carries them, alongside the name match
rather than instead of it. Default radius 25 km, clamped to 200,
admin-adjustable via the query. Both search screens offer "use my
location" on each field and resolve a typed town to a point once at
search time. `expo-location` was already installed in all three apps, so
this adds no native module.

**The searches, reshaped.** From, To, When and Seats (weight, in Cargo
Space), all labelled and visible before searching, with city suggestions
and a swap control. The day strip runs a **month**. An empty result keeps
the route chips and offers to register the corridor, which is stored in
a new `route_alerts` table and fires when a driver declares that route.

## Two safety fixes that were not on the list

**Anyone could assemble a driver's whereabouts.** `browseTrips` returned,
to any searcher who had booked nothing, each declared driver's full name,
plate, vehicle photograph, exact boarding address, destination
coordinates and exact departure minute. The customer app printed the
plate and the photo straight onto the browse list.
`vehicleIdentityForPassenger` is correct and stays, since a passenger in
a motor park at 5am has to pick the right vehicle out of the row. It was
being called on a public endpoint. Browsing now returns a first name, a
rating and a class of vehicle, and the identity columns are no longer
selected from the database at all.

**A trip could be moved after the driver accepted.** The guard existed
and read `trip.seatsBooked`, which only moves on the payment path.
Accepting sets the booking to `PENDING_PAYMENT` and never touches it, so
between acceptance and payment the departure could still change under
someone mid-payment. The freeze now counts live seat and parcel
commitments from the booking rows.

**And one found by accident.** The icon registries were typed
`Record<string, LucideIcon>`, so every wrong icon name compiled and
rendered nothing, which is why that file carries three separate comments
about invisible chrome. Typed properly, it immediately found
`trip-requests` rendering an unregistered `Navigation`.

## Waiting on the one deploy

Everything below is written, committed and compiling, and none of it is
live:

- browse-endpoint redaction (the driver-safety leak)
- distance matching, and matching on stored address text
- the trip freeze after acceptance
- route alerts: table, endpoint, and the notice fired on declare

This is **one** IP change, not five. The address-text match is the piece
that rescues trips already declared, including the Ile-Ife one.

## For the morning

1. The three APKs were rebuilt overnight (logo assets, and `expo-print` /
   `expo-sharing` for customer-app, which the 2 September APK predates).
   Check `docs/REBUILD-QUEUE.md` for what the pass actually cleared.
2. Nothing here has been seen on a screen. The searches, the location
   buttons, the month strip and the redacted trip card all compile and
   none have been driven.
3. Fee Catalogue values still shortened for testing and needing restoring:
   `corridor_min_lead_minutes` 5 to 180, `dispatch_warn_after_minutes`
   5 to 10, `pending_booking_expiry_minutes` 10 to 30,
   `travel_buddy_offer_timeout_min` 5 to 30.
4. `corridor_max_lead_days` should be checked against the 30-day strip.
   If drivers cannot declare that far ahead, the far end of the calendar
   promises days nobody can fill.

## Second half of the night

### The navigation bar, third attempt and the first one on the real cause

It was never the JavaScript. Expo's generated theme carries
`android:enforceNavigationBarContrast = true`, which is Android painting
its own pale scrim behind a transparent edge-to-edge bar, and no app-side
call beats it. On top of that `setButtonStyleAsync` is the legacy API and
is documented as unsupported under edge-to-edge, so the call we were
making refused, and the `.catch(() => {})` around it swallowed the
refusal. That is why two rounds of fixing looked right and changed
nothing.

`plugins/withNavBarContrast.js` turns the scrim off and `setStyle()` is
now called alongside the legacy one. `android/` is gitignored, so it had
to be a config plugin rather than an edit. **This needs the rebuild.**

### One okada, at last

The mark existed as four different drawings: the asset cutter and the
website correct, the admin dashboard at stroke 3.5 on a 48x32 box, and
all three apps at stroke 2 with outlined wheels and spokes. So the okada
in the app's own top bar was not the okada on the phone's home screen.
The geometry now lives in `shared/brand/mark.ts`, the three apps read it,
and the dashboard carries a documented copy because it has no path to
shared code.

### Sign-in

Standard Google and Apple buttons on all three login screens, to each
company's published branding rather than our house style. The customer
app previously had a text-only Google button that could never appear,
because no client id is configured anywhere; the other two had nothing.

The load-bearing part is the `role` that travels with the request.
`googleLogin` creates a CUSTOMER account for any unknown address, which
is right for the customer app and wrong for the other two: a driver's
signup also creates a Driver row and a business signup a
BusinessAccount. Driver and business now mean **sign in only**.

The same reasoning produced `adminSocialLogin` for the dashboard, which
refuses to create, requires the admin role, and preserves TOTP. Pointing
the dashboard at `/auth/google` would have been a way around the second
factor.

### Screens

Customer Rewards gained the seven-day bar card the driver's earnings
screen has always had. The weekly goal was deliberately not copied: a
customer-side goal programme is a parked founder decision.

Partner Earnings now shows where the payout lands, with a route to change
it. `payout-account.tsx` existed and was reachable only from the drawer.

The driver's store-handoff screen now renders the storefront photo, which
partners are made to submit and re-submit for approval and which was
shown to nobody.

## Two corrections to things I reported earlier tonight

1. **The business tab bar was not broken.** I reported seven tabs with two
   empty icons. That came off a stale screenshot from an earlier session;
   the other chat had already moved `documents.tsx` and `statement.tsx`
   out of the `(tabs)` folder at 11:40.
2. **My "the app booted" check was worthless twice.** The wait-loop tested
   the screenshot file's size *before* taking a new one, so it exited on a
   stale file. The apps do boot; the proof was the founder's own
   screenshot, not mine.

## Distribution: read this before sending anything to testers

Every APK built before this pass was a **debug** build. A debug APK
carries no JavaScript bundle and expects Metro running on this laptop, so
it works on the founder's phone and on nobody else's. The final pass
builds **release** APKs, which embed the bundle and install standalone.
They are signed with the debug keystore that the Expo template wires up,
which is fine for handing someone a file and **not** acceptable for the
Play Store. A real signing key is a separate job before launch.

**iPhone: not possible today.** Apple requires signing, so the route is
TestFlight, which needs an Apple Developer account at $99/year. Beneath
that, **there is no `ios/` directory in any of the three apps**: they have
only ever been built for Android. Bundle identifiers are set and
`eas.json` has the profiles, so EAS could build iOS without a Mac, but the
Apple account has to exist first.

## Still open

- **H3** was asked about and deliberately deferred. Its real win is
  covering a route *polyline* in hexagons so "does this trip pass near
  me" becomes a set intersection. We store stops, not polylines, so H3
  over stops answers exactly the same question as a radius check with a
  dependency attached. Revisit when polylines are persisted.
- Towns are not a closed set. States and LGAs are authoritative here;
  the settlement list is deliberately partial, and nothing treats an
  absent name as invalid.
