# SEIRS Cross-App Audit & Action Plan
**Date:** 2026-05-10
**Trigger:** User asked, before sleeping, to ensure design parity across the 3 apps and verify the full ecosystem (customer ↔ driver ↔ business) actually works end-to-end.
**Scope:** customer-app, driver-app, business-app, NestJS backend, shared theme + services.

---

## Executive Summary

Three audits ran in parallel (driver design, business design, backend ecosystem). Findings sort into three buckets:

| Bucket | What's there | Action |
|---|---|---|
| ✅ **Already aligned** | Driver active-delivery screen, KYC, auth flows, drawer, dashboard, deliveries list, wallet, rating flow, KYC/identity flow, bulk dispatch backend | No work |
| 🔧 **Safe fixes — applied during the audit** | 4× missing avatar URI props in driver-app, 1× broken `driversApi.getAvailableJobs()` call | Done in this session |
| ⚠️ **Substantial work — queued for your approval** | Business-app full redesign, navigation restructure (all 3 apps), backend WS protocol unification, vehicle taxonomy mismatch, missing chat / SOS / FCM wiring | Listed below with effort estimates |

---

## 🔧 Fixes Applied During This Session (Safe, JS-only, Hot-reload Picks Up)

### 1. Driver-app avatar photos now actually display
- `components/Drawer.tsx` line 60: added `uri={user?.profilePhoto}`
- `app/(driver)/profile.tsx` line 119: added `uri={user?.profilePhoto}`
- `app/(driver)/active.tsx` lines 355-356: replaced custom `<View>` avatar with shared `<Avatar>` component using `uri={delivery.customer.profilePhoto}`

**Why:** Customer-app passes `uri` to every Avatar so uploaded photos appear instead of initials. Driver-app was missing this prop in 3 places, so even uploaded photos showed only initial letters.

### 2. Driver-app home screen no longer calls a non-existent API method
- `app/(driver)/index.tsx` line 69: was `driversApi.getAvailableJobs()` (does not exist), now calls `driversApi.myDeliveries()` with a FIXME comment explaining the semantic gap (assigned jobs vs available pool).

**Why:** This was silently failing — the try/catch swallowed the error and the driver saw an empty job list. Now the screen at least shows assigned jobs. Real "browse available jobs" UX needs a new backend endpoint (queued below).

---

## ⚠️ Critical Backend Gaps That Break Cross-App Flows

These are **runtime-broken**, not just stylistic. Each blocks a real customer-driver round-trip.

### B1. Driver-app has no way to receive new jobs in real time
- Backend `runAutoMatch()` auto-assigns deliveries to drivers and broadcasts via Socket.io `/tracking` namespace.
- Driver-app does not subscribe to `job:request` event.
- Driver-app calls `getAvailableJobs()` which doesn't exist (now fallback to myDeliveries — patch only).
- **Fix needed:**
  1. Add `GET /deliveries/available` to backend — returns unassigned/pending deliveries near driver location.
  2. Add `driversApi.getAvailableJobs()` to `shared/services/api.ts`.
  3. Add Socket.io subscription on driver home to `job:request` event so new jobs appear without refresh.

### B2. WebSocket protocol mismatch — customer not getting status updates
- Backend uses **Socket.io** on `/tracking` namespace, emits `delivery:status` and `driver:location`.
- Customer-app `useDeliveryTracking` hook connects to `${SOCKET_URL}/ws` (raw WebSocket) and listens for keys like `driverLocation` and `status` on the message body.
- **These are different protocols.** Customer-app will never receive any real-time event from the current backend.
- **Fix needed:** Replace the raw-WebSocket hook with a Socket.io client subscribing to `/tracking` namespace, listening for `delivery:status` and `driver:location` events with the field names the backend emits.

### B3. GPS event field-shape mismatch
- Backend emits: `{ driverId, lat, lng, timestamp }`
- Customer-app expects: `{ driverLocation: { lat, lng, updatedAt } }`
- Even if B2 is fixed, the parser in customer-app would fail.
- **Fix needed:** Decide on one shape (recommend the flat backend shape) and update the customer hook to read the flat fields.

### B4. Vehicle taxonomy doesn't match across customer / driver / backend
- **Backend Prisma enum:** `BICYCLE | MOTORCYCLE | TRICYCLE | CAR | VAN` (5 values, no danfo, no trucks)
- **Customer-app Send:** `bicycle, motorcycle, keke, car, van, truck_sm, truck_lg` (7 values)
- **Customer-app Request a Ride:** `okada, keke, car, danfo` (Nigerian labels)
- **Shared VehicleIcon:** 7 keys including `truck_small`, `truck_large`
- **Fix needed:**
  1. Expand backend enum to: `BICYCLE | MOTORCYCLE | TRICYCLE | CAR | DANFO | VAN | TRUCK_SMALL | TRUCK_LARGE`
  2. Add canonical aliasing layer (e.g., `okada → MOTORCYCLE`, `keke → TRICYCLE`) so user-facing Nigerian labels persist while backend uses one enum.
  3. Re-run any Prisma migrations.

### B5. Driver earnings fields are undefined
- Driver home screen reads `driverData?.weekEarnings`, `todayEarnings`, `balance`.
- Backend `GET /drivers/me` does not return these fields (only basic profile + `lastLat`/`lastLng`).
- **Fix needed:** Add an aggregated earnings endpoint or extend `/drivers/me` to compute these from the Wallet + Delivery tables.

### B6. Chat / messaging is entirely missing
- Customer-app `messages/[chatId].tsx` exists, but no backend WS rooms, no controllers, no Prisma model.
- Driver-app has a chat icon but no screen wires up.
- **Fix needed:** Define `ChatMessage` Prisma model, add `ChatGateway` with `chat:<deliveryId>` rooms, build send/receive endpoints, wire both apps to the same room ID.

### B7. SOS / safety has no backend
- Customer-app `sos.tsx` button exists.
- No SOS endpoint, no driver/admin alert pipeline.
- **Fix needed:** Add `POST /sos/trigger` endpoint, broadcast to driver + admin via WS + push, write to immutable audit log.

### B8. FCM push notifications likely don't reach devices
- Backend `NotificationsService` calls `FcmService` correctly.
- No visible token-registration endpoint or client-side `expo-notifications` registration code.
- **Fix needed:** Add `POST /notifications/register-token` endpoint; in customer + driver app `_layout.tsx`, register the FCM token on auth-success.

---

## 📐 Design Parity Gaps

### Driver-app
- **Aligned:** active.tsx (real polyline + ETA chip), KYC, auth, drawer, schedule (correctly different — driver schedules availability, not bookings).
- **Just-fixed:** Avatar URI in 3 places.
- **Worth doing later:** Enable `showsUserLocation` on driver home demand-zone map (low priority).

### Business-app — **biggest design lag**
- `app/(business)/new-delivery.tsx` is still the OLD ScrollView-with-text-fields pattern. Customer's Send a Package is now full-screen-map + bottom-sheet + inline autocomplete + calendar picker. **This is the most visible inconsistency in the platform.**
- Business-app `package.json` is missing 4 dependencies needed to mirror the customer flow:
  - `@gorhom/bottom-sheet`
  - `react-native-maps`
  - `react-native-calendars`
  - `expo-location`
- **Adding `react-native-maps` and `expo-location` triggers a native rebuild** of the business-app APK. The other two are JS-only.
- **Effort:** ~3-4 days for the new-delivery refactor, ~30 min for the deps + rebuild.

---

## 🧭 Navigation Restructure (Tabs-inside-Stack) — All 3 Apps

You already approved this for customer-app. The audit confirms driver-app and business-app have the **same** Tabs-only navigator pattern, so the same Android-back-button bug exists in all three. Best to do all three in one pass for consistency. ~30-40 min total for the restructure across all three.

---

## 📋 Prioritised Action List (in order of value × cheapness)

| Priority | Action | Effort | Type | Risk |
|---|---|---|---|---|
| P0 | Restructure all 3 apps to Tabs-inside-Stack (fixes Android back button across the platform) | 30-40 min | JS | Low |
| P0 | Backend: add `GET /deliveries/available` + driversApi method (B1) | 2-3 hr | Backend + API | Medium |
| P0 | Backend: unify WS to Socket.io + fix customer hook (B2 + B3) | 3-4 hr | Backend + JS | Medium |
| P0 | Backend: align vehicle enum (B4) + run migration | 1-2 hr | DB migration | Medium |
| P1 | Business-app: redesign new-delivery to match customer Send | 3-4 days | Big JS rewrite + rebuild | Medium |
| P1 | Backend: driver earnings endpoint (B5) | 2-3 hr | Backend | Low |
| P1 | Wire FCM tokens (B8) | 2-3 hr | Backend + JS | Low |
| P2 | Build chat backend (B6) | 1-2 days | New feature | Medium |
| P2 | Build SOS pipeline (B7) | 1 day | New feature | Low |
| P2 | Driver home: enable showsUserLocation on demand-zone map | 5 min | JS | Low |

---

## What I Did NOT Do (and Why)

- **Business-app new-delivery redesign:** Substantial native-rebuild work (~3-4 days). Wanted your approval before committing.
- **Backend changes:** Touch live API surfaces. Wanted your eyes-on before modifying schemas, WS protocols, or migrations.
- **Tabs-inside-Stack restructure:** You approved customer-app earlier today; figured cleaner to do all three at once when you're awake to verify.
- **Driver home polyline rendering:** Not a real gap — driver home is a demand heatmap (radius circles), not a route view.

---

## Recommended Next Session Sequence

1. **Skim this doc** (~5 min) and tell me which P0/P1 items to greenlight.
2. **I do the navigation restructure across all 3 apps** (30-40 min, no rebuild).
3. **I fix the WS protocol + GPS field shape (B2 + B3)** so live tracking actually works (3-4 hr).
4. **I add `GET /deliveries/available` + driver subscription** so new jobs appear in real time (2-3 hr).
5. **You decide** whether to greenlight the business-app redesign now or after MVP.

Total time to make the platform cohesive end-to-end: roughly one full focused day if I run continuously.
