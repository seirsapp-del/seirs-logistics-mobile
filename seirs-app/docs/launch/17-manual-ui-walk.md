# Manual UI Walk Checklist

These are the checks that only a human with a phone (and a browser for admin / website) can do. Run before any production launch and after any significant deploy.

**Backend check first:** run `./scripts/smoke.sh` from the repo root. If any line fails, fix the deploy before walking the apps — every check below depends on the backend being live.

Each section takes 5-10 minutes. Total run time ~60 minutes if everything works.

---

## A — Customer app

Install: open the EAS preview build link from `eas build:list --profile=preview --platform=android` (most recent).

### A1 — Auth flow (5 min)
- [ ] Open the app cold (force-stop first)
- [ ] **Register** with a fresh phone number → receive OTP email → enter OTP → land on home
- [ ] Force-quit → reopen → confirm you stay logged in (no re-login prompt)
- [ ] Tap profile → **Sign out** → land on onboarding

### A2 — Settings (16A) (3 min)
- [ ] Sign back in
- [ ] Profile → **Language** → tap Yorùbá → confirm UI flips to Yoruba labels
- [ ] Switch back to English
- [ ] Profile → **Notifications** → toggle "Marketing Messages" OFF → close + reopen the screen → toggle should still be OFF (proves backend save works)
- [ ] Profile → **Privacy** → tap "Download My Data" → confirm alert says "Export queued"
- [ ] Tap "Delete My Account" → confirm it routes to the delete screen (don't actually delete)

### A3 — Send a package (10 min)
- [ ] Home → tap "Send a Package" search bar
- [ ] Pickup: type your real address → tap suggestion → confirm map pins to location
- [ ] Dropoff: pick another real address
- [ ] Pick vehicle: Motorcycle
- [ ] Pick package size: Small
- [ ] Confirm price quote shows
- [ ] Tap **Continue** → land on payment picker
- [ ] Pick **Wallet** → confirm flow proceeds (or "insufficient balance" if wallet empty)
- [ ] Back, pick **Card** → Flutterwave inline opens
- [ ] Cancel out

### A4 — History + Receipt (5 min)
- [ ] History tab → confirm any past trips you've taken appear (no "MOCK_TRIPS" labels)
- [ ] Tap a delivered trip → trip detail loads from real API (not 404, not "Mock Trip 1")
- [ ] Tap "View Receipt" → receipt screen renders with real fare breakdown
- [ ] Tap "Email Receipt" → confirm "Sent" alert + check your email within 60s

### A5 — Send Multiple (16G) (5 min)
- [ ] Drawer → "Send Multiple"
- [ ] Pickup address picker works
- [ ] 2 default recipient cards visible — add a 3rd via "Add recipient"
- [ ] Fill name + address + description for each
- [ ] Submit → should book 3 deliveries in parallel
- [ ] Success screen lists 3 tracking codes
- [ ] "Done" routes back to home

### A6 — Promotions + Loyalty (3 min)
- [ ] Drawer → Promotions → confirm real promos load (or empty state if none active)
- [ ] Drawer → Loyalty → tier + points display real data
- [ ] Type an invalid promo code → expect "code not found" error

### A7 — Report Issue → ticket (16B) (3 min)
- [ ] Trip details → tap flag icon top-right
- [ ] Pick category "Lost Item" + describe
- [ ] Submit → "Report Submitted" success → confirm ticket appears for admin (admin walk B5 verifies)

---

## B — Driver app

Install: same EAS pattern with driver-app.

### B1 — Auth + KYC (5 min)
- [ ] Register with a NEW phone number (do not reuse customer's)
- [ ] Complete OTP
- [ ] KYC: upload National ID + driver's licence + vehicle photo from gallery
- [ ] Confirm each upload shows green tick

### B2 — Go online + accept job (16C) (10 min)
**Needs:** a fresh delivery to claim. Have a friend (or your customer-app account from A3) book one in the same area.

- [ ] Driver home → toggle online
- [ ] Available jobs feed shows the new delivery within ~30s
- [ ] Tap the job → job detail loads with real customer name + pickup/dropoff
- [ ] Tap **Accept** → routes to active.tsx without errors
- [ ] Tap **Started trip** → status updates to "in transit"
- [ ] Mark **Delivered** → trip closes, earnings credited

### B3 — Vehicle persist (16C) (2 min)
- [ ] Profile → Vehicle Details
- [ ] Change "Color" to "Black"
- [ ] Tap Save → "Vehicle details saved" banner appears
- [ ] Force-quit + reopen → confirm Color is still "Black" (proves backend save)

### B4 — Premium subscribe (16F) (5 min)
**Needs:** at least ₦5,000 in driver wallet.

- [ ] Profile → Work → **SEIRS Premium**
- [ ] Hero shows ₦5,000/week price
- [ ] Tap "Activate — ₦5,000/week"
- [ ] Alert confirms activation
- [ ] Status card now shows "Active" + "Next charge: <date 7 days away>"
- [ ] (Don't pause — leave active to verify cron fires)

### B5 — Notifications (16C) (2 min)
- [ ] Profile → Notifications → confirm list comes from backend (not "Mock Job Available")
- [ ] Tap any unread → mark-read animation, refresh page → still read

---

## C — Business app

### C1 — Sender onboarding (5 min)
- [ ] Register as a Business (sender) account
- [ ] Fund wallet via Flutterwave (₦5,000 minimum)
- [ ] Confirm wallet balance updates

### C2 — Recurring delivery (16F.1 — already shipped) (5 min)
- [ ] Drawer → Recurring Deliveries
- [ ] Tap "Create new template"
- [ ] Pick a recent past delivery from the modal
- [ ] Set cadence: Weekly, Monday, 09:00
- [ ] Save → template appears in list
- [ ] Confirm "Next: Mon 09:00" shows correctly

### C3 — Apply to be a Partner (3 min)
- [ ] Profile → Apply to be Partner Store
- [ ] Upload storefront photo + owner ID
- [ ] Submit → status "Pending review" → confirm admin sees it (walk D2)

---

## D — Admin dashboard (browser)

Open the admin dashboard URL (your Vercel deploy).

### D1 — Login (1 min)
- [ ] Email + password
- [ ] TOTP prompt → enter 6-digit code
- [ ] Land on dashboard
- [ ] Confirm "Refresh" doesn't immediately log you out (30m JWT + sliding-window refresh from bucket 12)

### D2 — Partner applications (16D verify) (2 min)
- [ ] Sidebar → Partner Applications
- [ ] Confirm the application from C3 appears
- [ ] Review docs → Approve with optional note
- [ ] Customer should now have `canPartner: true` (verify in app: drawer should show partner sections)

### D3 — Wallet ops (16D) (3 min)
- [ ] Sidebar → Wallet & Payouts
- [ ] 3 summary cards show real ₦ totals (Pending / Held / Paid MTD)
- [ ] If any rows in "Held Earnings" — click "Release" on one → confirm it disappears (moves to Pending)

### D4 — Settings + maintenance mode (16D + 16E) (5 min)
- [ ] Sidebar → System Settings
- [ ] Confirm 6 config rows render
- [ ] Edit "Support Email" → save → refresh → value persists
- [ ] **DANGER:** flip `maintenance_mode` to `on` → save
  - [ ] Open customer app → try to book a delivery → should see "SEIRS is temporarily in maintenance mode" error
  - [ ] Open `/maintenance/status` in browser → confirm `{maintenanceMode: true}`
  - [ ] Flip back to `off` in admin
  - [ ] Customer booking works again within ~10 seconds

### D5 — Tickets (16B verify) (1 min)
- [ ] Sidebar → Tickets → confirm the ticket from A7 appears
- [ ] Open it → reply → close

### D6 — Reports (16D) (2 min)
- [ ] Sidebar → Reports
- [ ] Click "Download CSV" on Delivery Performance → CSV file downloads
- [ ] Open it → confirm real data (not "placeholder")

### D7 — Referrals (16D) (1 min)
- [ ] Sidebar → Referrals
- [ ] Confirm real user pairs (or empty state if no referrals yet)

---

## E — Website (browser)

Open your seirs.app URL.

### E1 — Pages render (5 min)
- [ ] Homepage hero loads
- [ ] /how-it-works, /for-business, /for-drivers, /for-partner-stores all load
- [ ] /news shows at least one article from the CMS
- [ ] /faq + /changelog + /careers load
- [ ] /privacy-policy + /terms-of-service load

### E2 — Contact form (2 min)
- [ ] /contact → fill name + email + message
- [ ] Submit → success message
- [ ] Confirm email arrives at support@seirs.co

### E3 — Cookie banner (1 min)
- [ ] Open in incognito → banner appears
- [ ] Click "Accept" → banner dismisses, doesn't return on next page

---

## F — Public Developer API (16-pre + verify)

Use Postman, curl, or `gh api`. Skip if you're not testing the Tier-3 surface.

### F1 — Generate test key (3 min)
- [ ] Business app → Profile → API Keys → Create with mode "Test"
- [ ] Copy `sk_test_...` secret

### F2 — Quote + order via /v1/* (5 min)
```bash
curl -X POST https://api.seirs.app/v1/orders \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"pickup":{"address":"...","lat":6.5,"lng":3.4},"dropoffs":[{"address":"...","lat":6.6,"lng":3.5}]}'
```
- [ ] Expect 201 + JSON with `id`, `trackingCode`, `status: pending`
- [ ] Repeat with same Idempotency-Key → should return same order, not duplicate
- [ ] Cancel via `DELETE /v1/orders/:id` → status flips

---

## Reporting bugs found

Per-bug, capture:
1. **Screen** (app + screen name)
2. **Action** (what you tapped)
3. **Expected** (what should have happened)
4. **Got** (what actually happened — exact error message + screenshot if visible)
5. **Backend traces** — check Sentry if DSNs are configured, else Railway logs for the same timestamp

Open a GitHub issue per bug or paste straight into chat. I can read the code and patch.
