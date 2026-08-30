# SEIRS — full platform brief

*Written 30 August 2026, from the codebase rather than from the plan. Where
the two disagree, the codebase wins and the difference is marked.*

---

## 1. Summary

SEIRS is a Nigerian logistics and mobility platform. It moves **parcels,
people, and freight** on the same rails, using the vehicles Nigerians
already ride: okada, keke, danfo, cars, vans and trucks.

Three phone apps, one admin console, one public website and one backend.
**51 backend modules, 461 API endpoints, 154 app screens, 52 admin pages.**
Payments run through Flutterwave; the backend is on Railway, the web
properties on Vercel, files on Cloudflare R2, mail through Resend.

The positioning is not "another delivery app". It is **the logistics layer
other businesses build on** — the same shape Flutterwave took for payments.
A public REST API with API keys, webhooks and a sandbox already exists and
works.

Three things make it structurally different from Gokada, Kwik or Sendbox:

1. **It carries people and parcels on one network.** A rider going Lagos to
   Ibadan can sell a passenger seat and carry three parcels on the same
   run. Neither side has to fill the vehicle alone.
2. **Chain of custody is the product.** Every handoff is a scan, a photo, a
   one-time code and a timestamp, with a written liability matrix saying who
   pays when something goes missing at each link.
3. **Partner stores turn shops into infrastructure.** A kiosk becomes a
   drop-off and collection point, earning a fee per package, which removes
   the need for SEIRS to build depots.

Launch target: **1 September 2026**, Nigeria.

---

## 2. The ecosystem — six surfaces

| Surface | Stack | Who uses it | Scale |
|---|---|---|---|
| **Customer app** | React Native / Expo | Anyone sending a parcel or taking a ride | 55 screens |
| **Driver app** | React Native / Expo | Riders and drivers | 50 screens |
| **Business app** | React Native / Expo | Company senders **and** partner stores | 49 screens |
| **Admin console** | Next.js | SEIRS operations | 52 pages |
| **Public website** | Next.js | Marketing, tracking, partner directory | — |
| **Backend** | NestJS + Postgres + Redis + Socket.IO | Everything | 51 modules, 461 endpoints |

The business app is two products behind one login: a **sender** account for
companies dispatching parcels, and a **partner store** account for shops
acting as drop-off points. A business can hold both.

---

## 3. What SEIRS actually does

### 3.1 Send a parcel

Seventeen service categories, each with its own vehicle set, handling time
and surcharge: documents, small and standard parcels, fragile and
electronics, hot food, cold and frozen, medical supplies, bulk goods, farm
produce, building materials, lumber, single-item and full house moves, live
animals, industrial parts, and a catch-all.

Booking captures photos, weight, category, declared value, the receiver's
name and phone, and a fallback instruction chosen **before** anything goes
wrong: hand to the receiver only, a named neighbour, the gate with photo
proof, or a partner store.

The vehicle is recommended from weight **and** category, not weight alone —
cold chain forces a van, fragile prefers a keke.

### 3.2 Book a ride

In-city rides through a separate ride pricing engine. Passenger transport is
a first-class service category, not a bolt-on.

### 3.3 Travel Buddy — the differentiator

A driver already making an intercity trip declares the route, the seats they
genuinely have spare, and how much boot space is left. Passengers search a
corridor and buy a seat; parcels get matched to the same vehicle by the
matching engine.

Critically, it is **segment aware**. A Jos → Ibadan → Lagos trip sells the
Ibadan → Lagos leg on its own, priced on that leg's measured distance, with
the passenger boarding at the rider's declared Ibadan stop. SEIRS prices
every seat — drivers never set their own numbers — and the seat ledger
refuses to oversell under simultaneous bookings.

### 3.4 Partner stores

A shop registers as a partner, sets its capacity, and earns a per-package
fee for handling drop-offs and collections. Packages sit with a clock
running; storage beyond a free window accrues a holding fee.

This produces the cheapest delivery tier: **store drop-off → store
collection**, where a driver batches many packages onto one intercity run.

### 3.5 Developer platform

`POST /v1/orders`, `/v1/quote`, order fetch and cancel, behind API keys with
live and test modes, plus webhooks that genuinely fire on status
transitions. An e-commerce site integrates SEIRS instead of contracting
riders.

---

## 4. How the money works

### Live now

- **Driver commission** — the platform's cut of every delivery and ride,
  set per vehicle on a versioned rate card.
- **Rate card pricing** — base fare plus per-km, adjusted by category
  surcharge, weight, dwell time, time-of-day and state/zone. Versioned and
  published, so a price change is auditable.
- **Fee Catalogue** — 91 admin-editable rows. Every fee, cap, threshold and
  window in the system is a database row with a code fallback, changeable
  from the console without a deploy.
- **Storage fees** on partner-store overstays.
- **Partner handling fees** per package.
- **Driver Premium subscription** — a flat weekly fee as an alternative to
  commission.
- **Loyalty** — points ledger with tiers that unlock an earning multiplier
  only, deliberately no fee discounts, to keep the liability cheap.
- **Developer platform** — usage-based, infrastructure already built.

### Specced but NOT built

Be careful with these in any strategy deck:

- **Customer booking fee** — retired from the catalogue.
- **Surge multiplier** — retired.
- **SEIRS Plus** customer subscription — not built.
- **Sponsored partner placement** — not built.
- **Insurance referral commission** — not built.
- **Micro-loans, fuel cards, wallet float interest** — year-one ideas, no code.
- **Business wallet** — deliberately removed. Senders never hold naira
  balances; that is deposit-taking and SEIRS is not a bank. Only drivers and
  partner stores have withdrawable earnings.

---

## 5. The operational model

### Chain of custody

Every transition is a scan, a photo and a timestamp. The liability matrix is
explicit: customer until the store receives, store until the driver scans,
driver in transit, store again at destination, store until the recipient
scans. Disputes resolve against the record rather than argument.

### Identity at handoff

Two routes, recipient chooses:

1. **Physical ID plus email OTP** — any of National ID, driver's licence,
   voter card, NIN slip or passport, with a one-time code to the recipient's
   email.
2. **SEIRS ID plus typed signature** — for people without physical ID. The
   system shows the expected name, the recipient says it, the handler types
   it, and the typed name is the signature.

**Email OTP only. No SMS at launch**, deliberately, to keep operating cost
down.

### Verification is a trust upgrade, not a gate

Unverified users get full app access. Verification unlocks higher limits,
insurance, interstate and COD — it does not block the product.

### Built for Nigerian conditions

- **Offline GPS logging** to local storage, batch-uploaded on reconnect, so
  a network hole does not lose the route.
- **Manual status broadcast** — three taps: bad network, stuck in traffic,
  need help.
- **Drivers cannot go offline holding an active job.** The server refuses.
- **No arrival-time promises anywhere.** Lagos traffic, NEPA and checkpoints
  decide arrival; a promise SEIRS cannot keep is a refund magnet. This is a
  standing rule and the marketing copy is audited against it.
- **Four languages**: English, Hausa, Igbo, Yoruba, at full key parity.
- **Nigerian vocabulary**: okada, keke, danfo, not motorcycle and tricycle.

---

## 6. What is NOT built

For honest planning:

- **No team accounts.** No invite, no member list, no roles, no per-person
  spend. A business is one login.
- **No bulk CSV upload.** Removed; the multi-package flow replaced it.
- **No social login.** Google and Apple endpoints exist server-side, but no
  client is wired, so it is email and password only.
- **No SMS.** Email only.
- **No branded notifications.**
- **No CSV export or CRM import** for senders.
- **iOS is not built.** Android only at launch.
- **The driver app has never had a full QA walkthrough.** 49 routes,
  untested end to end. This is the largest known risk.

---

## 7. Position and risks

**The strongest story** is that no one else moves people and parcels on the
same vehicle with a segment-priced intercity marketplace, and that the
chain-of-custody record is good enough to settle disputes rather than argue
them.

**The honest risks**:

- Supply. The model needs riders declaring intercity trips before Travel
  Buddy has anything to sell.
- Android only at launch.
- Trust. Handing a parcel to a stranger on an okada is the core objection;
  the answer is the identity and photo record, which has to be visible early.
- Cash. Bootstrapped, so discounts stay conservative and every loyalty perk
  is capped.

---

## 8. Where things stand

Backend, admin and website are deployed. All three Android apps build and
install. Payments are live through Flutterwave. Pricing, matching, escrow,
tracking, chat, identity, loyalty, referrals, partner stores, Travel Buddy
and the developer platform are all implemented and running.

Launch is **1 September 2026**.
