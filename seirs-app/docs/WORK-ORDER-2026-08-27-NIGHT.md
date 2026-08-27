# Night work order, 27 August 2026

Queued while the founder tests on the phone. Everything here is work he
has approved in principle but which needs long builds or long stretches
of uninterrupted editing, so it waits until the machine is free.

Ordered by value, not by size.

---

## 1. Zones, replacing three dead pricing features

**Spec:** https://claude.ai/code/artifact/2b9ad396-1537-494b-9082-e10f3b066931

Hotspot circles, restricted sub-zones and geopolitical zone overrides
are all the same idea, all live in `regions`, and `regions` is null on
the live card. So all three are inert today.

None of them can express the thing that actually matters: an area where
SEIRS does not operate. Founder, 27 Aug: *"when i say close it means
closed so no form of operation there."*

**Blocked on four decisions** (listed at the end of the spec):
who may close an area, whether closures expire by default, whether the
five statuses are right, and whether a closed area hides from search or
refuses on selection.

**Do not start the build until those are answered.** The data model
depends on all four.

Known engine constraint, found while writing the spec: `resolveRegion`
is only ever called with the PICKUP, at pricing.service lines 596 and
870. There is no destination-side zone resolution at all, so blocking a
drop-off is new plumbing rather than new data.

---

## 2. Shared address field, with coordinates on every surface

Founder, 27 Aug: Nigerian addresses are unreliable, so every address
field should carry coordinates.

**What exists already:** `StreetAutocomplete` resolves coordinates via
`placeDetails` and fires `onCoordsResolved(lat, lng)`. The accuracy
plumbing is done.

**What is missing:**

- The component exists TWICE, once in customer and once in business, as
  separate copies that will drift. The driver app has neither.
- Only one input mode: type and pick a suggestion.

**Build:** move it to `shared/components/AddressField`, then add
- drop a pin on a map
- use my current location
- paste a location link (parse coords out of a Google Maps or WhatsApp
  share, which is how Nigerians actually exchange locations)
- landmark / how to find me, free text, for the last 50 metres
- advanced: raw lat/lng, collapsed, for depots

**Nine entry points** to wire: customer register, addresses, request,
send, track; business register, apply-partner, edit-profile,
send-package. Driver interstate needs it and currently has NO picker at
all, which is the direct cause of the Jos bug below.

---

## 3. Driver interstate screen

Already committed but unverified on device:

- Departure is now a calendar plus half-hour time slots, not a text box
  wanting `YYYY-MM-DD HH:mm`.
- Backend accepts `destLat`/`destLng`/`destAddress` so a trip can go
  anywhere, not just the twelve cities in `CITY_COORDS`.

**Still to do:** the FROM and TO fields are still free text. Until they
use the picker, a rider can still declare a trip to somewhere the
server cannot map. The backend now says which END is unmapped rather
than blaming the pickup, but the real fix is the picker.

---

## 4. Coordinate survival audit

Separate from the input work and worth doing regardless.

Every address field should carry its coordinates all the way to the
rider's Directions button. At least one place did not: the mid-route
address change passed flat `lat`/`lng` that the engine ignores, because
it reads `pickupCoords.latitude`. Fixed 27 Aug, but that is the second
time this exact mistake has shipped, so the rest of the call sites need
checking.

---

## 5. Email template design system

Founder, 27 Aug: multiple real designs visible in the dashboard with
colours and images, the ability to create new ones, seasonal cases like
Christmas and birthdays, a scheduler, and critically an editor a
non-technical person can use that shows the ACTUAL rendered email
rather than markup.

Shipped already: the editor now controls what sends, test-send to your
own inbox, per-template banner and header colour, four seasonal
templates.

**Still to build:** the gallery of real designs, create-from-existing,
the WYSIWYG-style editor with an iframe preview, and the campaign
scheduler. The send path must default to sending only to the requesting
admin until the founder explicitly enables real bulk sending.

---

## 6. Cancellation-pay wiring

Lost to the laptop crash on 25 Aug and never rebuilt. The only piece of
that night's work still missing.

---

## Smaller, still open

- **Business app bottom nav says "Wallet".** Senders never hold naira
  balances, so the name implies a stored balance we do not offer and do
  not want to imply under CBN rules. Naming decision, not a bug.
- **Driver and business APKs are ~200MB against customer's 109MB.**
  Same framework, similar screens, so the gap is likely extra native
  modules or an ABI the customer build excludes. Worth trimming before
  release in a market where people watch their data.
- **v2 zone card.** The state-aware inter-state tier cannot run until a
  card carrying `interStateAdjacentPct` and `crossZonePct` is published.
  Coordinates already reach the engine; the card is the missing half.
- **Service fee is 0.00.** Fully wired, purely a decision.
- **High-value rider share is 0.** Also purely a decision.

---

## Environment notes worth keeping

- **`--offline` is mandatory** when starting Metro. Without it the Expo
  CLI hits a dependency-check endpoint, throws
  `TypeError: Body is unusable: Body has already been read`, and kills
  Metro seconds after it binds the port.
- **Bundle the apps one at a time.** Three Metros starting together put
  the laptop at 0.26GB free and even a local curl timed out.
- **One app at a time on the PHONE.** Three React Native dev builds hold
  ~1.17GB on a 3.8GB device and the third is starved before it can
  finish starting. Nothing errors; it just never leaves the splash.
- **A Gradle rebuild is about 35 minutes** on this machine, and wants
  the Gradle daemons killed afterwards to give back ~1GB.
- **Do not pipe a long build through `tail`.** It buffers, so there is
  no progress output until the command finishes.
