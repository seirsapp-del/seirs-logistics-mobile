# SEIRS apps: UX audit from the 2026-08-15 device session

**Method:** every screen judged against the founder's questions: what is this
screen for, does the flow fit, is there too much or too little information,
what are the must-haves, is the order right, what happens when you type, what
will go wrong for a real user, and would this screenshot make anyone install
the app. Captures from a real A30, driven end to end, not tapped at random.

**Status key:** FIXED = shipped this session · QUEUED = specified, needs a
build session · DECISION = founder call.

---

## Customer app

### Home
**Purpose:** route the two intents (send / ride) in one glance and prove the
account is alive.
**What works:** search-first layout; live delivery card top; okada/keke/danfo
vocabulary; Rewards named correctly; carousel gives it life.
**Findings:**
1. The points chip read "0 pts" and Recent Trips was one row. As a marketing
   screenshot this says *nobody uses this app*. We built demo-loyalty seeding
   for exactly this and it was not run before capturing. — **DECISION/ACTION:
   founder taps Admin → Settings → Seed demo data, then home gets recaptured.**
2. Carousel's "COMING SOON" slide was the frame captured first. A screenshot
   session should swipe to a shipped-feature slide. — QUEUED (recapture).
**Must-haves check:** search, live delivery, send, ride, rewards — all
present, correctly ordered top-to-bottom by urgency. Density is right.

### Request a Ride (map + addresses)
**Purpose:** two pins with the least friction possible.
**Findings:**
1. Opened centred on **Berlin** (device GPS, founder abroad). A Nigerian app
   should never open outside its service area. — **FIXED**: GPS followed only
   inside Nigeria's bounding box, else Lagos default.
2. **Typing:** autocomplete answers are real and fast (Ikeja City Mall found
   with correct Obafemi Awolowo Way addresses) but the list renders entirely
   below the keyboard on a 740px phone: the user types and sees nothing
   change. Diagnosed precisely: the sheet's keyboardBehavior="extend" is
   capped by its 480px snap point; the predictions band falls in the covered
   region. — QUEUED: keyboard-aware taller snap.
3. Hardware back threw away a fully typed route without asking. — **FIXED**:
   discard confirm when either field holds text.
4. Pin-set → map snap to Lagos works and reads beautifully; route drawing
   (Ikeja→UNILAG) is genuinely impressive on screen.

### Choose Ride (vehicles + fares)
**Purpose:** pick vehicle, see price, commit.
**What works:** the strongest screen in the product. Four vehicles, live
fares, ETAs, tags ("Fastest in traffic"), selected state, fare breakdown CTA.
**Findings:**
1. Keke wore a car icon (Ionicons has no tricycle). — **FIXED**: real
   rickshaw glyph via MaterialCommunityIcons.
2. Fares came from in-app mock tables while the backend charged a different
   formula. — **FIXED at the charge level** (single rate-card engine
   server-side); QUEUED: point this screen's displayed numbers at the unified
   quote endpoint so shown and charged can never drift.

### Trip Details
**Purpose:** receipt + gateway to tracking.
**What works:** itemised night fee, paid-by-card badge, tracking code, route
summary. Right density, right order.
**Finding:** status chip said **"Pending"** while the tracking screen said
"Arrived" for the same trip. Two screens, one truth violated. Root cause is
below. — QUEUED (same fix as tracking).

### Live tracking
**Purpose:** the anxiety killer. Where is my package, who has it.
**What works visually:** progress steps, ETA chip, driver card with rating
and plate, SOS and Package QR one tap away. As a screenshot it sells.
**Finding — the most serious in the customer app:** the map drew
Lagos→Lekki→Ibeju while the trip was Ibadan→Akobo. The screen still renders
**mock route data** (the known P0: trip-progress falls back to MOCK_TRIPS).
A real user tracking a real package would watch a fiction. — QUEUED P0: wire
to the live tracking endpoint; the public /track/[code] backend already
serves real events.

### Send a Package (step 1)
**Purpose:** describe the parcel.
**What works:** "Drop at a store instead" option surfaces the partner
network at the right moment; category chips; clear required markers.
**Findings:**
1. Photo requirement (min 1) gates the entire flow at step 1. Right for
   fraud, but it is the flow's biggest drop-off risk; consider allowing
   photo at handoff for low-value categories. — DECISION.
2. Cannot be tested end-to-end without a photo. — **Needs founder: one
   package photo on the phone, then the remaining 4 steps get audited.**

---

## Business app

### Dashboard
**Purpose:** the morning glance: money, workload, shortcuts.
**Findings:**
1. Wallet card, stats, quick actions are the right four blocks in the right
   order.
2. Stats read 0 / 0 / 0 with "No deliveries yet" — same dead-account problem
   as the customer chip. The founder's own account is the demo here; either
   seed business demo activity or screenshot the demo store account. —
   ACTION with the same admin seed tap.
3. Header (greeting, bell, **hamburger**) scrolls away, so the drawer is
   unreachable once the user scrolls: confirmed source of "hamburger not
   visible". — QUEUED: sticky header row.

### Tab bar (all business screens)
**Finding:** business had drifted from the customer/driver pattern: 10px
labels, faint tint, zero cushion on button-nav phones, five targets pressed
against the system bar. — **FIXED**: matches siblings now (12px, darker
inactive tint, 8px floor, taller bar). Customer and driver were checked and
already healthy.

### Messages
**Finding:** empty state stranded "Contact SEIRS support" in the top third
of a dead page. — **FIXED**: centred.
**Still queued:** the empty state should also *sell* (mini illustration in
brand style, like customer app empties).

### New Delivery (step 1)
**Purpose:** the business power-booking flow.
**Findings (founder: "worse designed given how far the customer app has
come" — agreed):**
1. Vehicle labels said Motorcycle / Tricycle / Van, violating the
   okada/keke/danfo rule the customer app follows. — **FIXED**: Okada, Keke,
   Danfo / Van.
2. Category chips render as clipped skeletons with "Swipe to see more":
   the first element a user meets is unreadable. — QUEUED: wrap chips like
   the customer app.
3. The wizard shows the tab bar, wasting a row mid-flow where the customer
   Send flow runs full-screen. — QUEUED.
4. No illustration, no warmth: it reads like a form, the customer flow
   reads like a product. — QUEUED: port the customer step pattern
   (illustration header, helper copy, store-drop equivalent for bulk).

### Wallet
**What works:** balance, fund, history — clean and correct for business.
**Finding:** copy says "Earn 1 point per ₦500 **spent**"; the code awards
1 per ₦100 **funded**. Different basis, different rate. — **DECISION:
which is the intended economics? One line to fix once chosen.**

---

## Driver app (sweep pending next Metro session)
Verified so far from code + earlier captures: job cards show net "You earn"
before acceptance (correct and now paid verbatim at escrow release after the
night-fee payout fix). Full screen-by-screen pass queued with the same
questions.

---

## Website screenshot verdict (the founder's bar: "would it make anyone
download the app?")
| Shot | Verdict |
|---|---|
| Ride with pins + route | Yes: real Lagos, real route |
| Choose Ride fares | Yes: strongest sell in the set |
| Live tracking + driver card | Yes |
| Customer home | **Not yet: 0 pts kills it — reshoot after demo seed** |
| Business dashboard | **Not yet: 0/0/0 stats — reshoot after demo seed** |

---

## What only the founder can do (everything else proceeds without you)
1. **Admin → Settings → Seed demo data** (one tap): populates points, trips
   and business activity, then home + dashboard get reshot and swapped.
2. **A package photo** on the phone: unlocks the Send flow end-to-end audit.
3. **Loyalty basis decision:** per-₦500-spent or per-₦100-funded.
4. Standing: password rotation, NDPR registration.
