# Night report, 5 September 2026: a place is a point, not a word

Read this first. Two commits, nothing pushed, nothing deployed. The
production API is exactly where the payment tests left it.

```
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

## Still open

- **H3** was asked about and deliberately deferred. Its real win is
  covering a route *polyline* in hexagons so "does this trip pass near
  me" becomes a set intersection. We store stops, not polylines, so H3
  over stops answers exactly the same question as a radius check with a
  dependency attached. Revisit when polylines are persisted.
- Towns are not a closed set. States and LGAs are authoritative here;
  the settlement list is deliberately partial, and nothing treats an
  absent name as invalid.
