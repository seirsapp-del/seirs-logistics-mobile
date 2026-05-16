# Apple Developer Enrollment (iOS Phase — Deferred)

**Status:** DEFERRED until iOS build is on the table. Per [`project_seirs`](../../../../Users/Seye_xiv/.claude/projects/c--FlutterProjects/memory/project_seirs.md) memory, Nigeria launches Android-first; iOS comes later (likely v1.2 after Lagos market validation).

This doc exists so the playbook is ready when you flip the switch — no scrambling needed.

---

## Why deferred

1. **$99/year recurring cost** (Apple Developer Program) — pointless until you're shipping iOS
2. **24–48 hour enrollment review** — fast enough to wait
3. **Nigerian iPhone market share** is ~10% — Android-first captures the bulk of the addressable market
4. **3 apps × 3 listings** is real submission work — better done in one focused sprint

---

## When to flip the switch

Trigger conditions (any one is sufficient):
- Year 1 Lagos market validation hits 5,000+ deliveries/day
- A material B2B customer (e.g. a corporate ride account) requests iOS
- Apple introduces a sideloading exception in Nigeria (unlikely but worth tracking)
- You hit ₦100M ARR — iOS users skew higher-LTV in fintech/logistics

---

## Enrollment checklist (when triggered)

### Step 1 — Apple Developer Program registration
1. Sign up at https://developer.apple.com/programs/
2. Choose **Organization** (not Individual)
3. Provide:
   - D-U-N-S Number (free from Dun & Bradstreet — request via Apple's tool; ~14 days for Nigerian companies)
   - Legal entity name (must match CAC registration exactly)
   - Authorised signatory (typically founder/CEO)
4. Pay $99 (₦150,000–₦200,000 at current FX)
5. Apple verifies entity via D-U-N-S — typical 1–2 weeks for Nigerian companies

### Step 2 — App Store Connect setup
- Create 3 app records: SEIRS Customer, SEIRS Driver, SEIRS Business/Partner
- Bundle IDs (suggested): `co.seirs.customer`, `co.seirs.driver`, `co.seirs.business`
- Assign roles (admin / developer / marketing) per team member

### Step 3 — Backend env var
Add `APPLE_CLIENT_ID` to Railway environment. The backend's `POST /auth/apple` endpoint already accepts Apple Sign-In tokens (commit c51c9ab / Phase 1 Payments), it just sits dormant without this var.

### Step 4 — Customer-app build updates
- Add `expo-apple-authentication` (already in dep list per memory? — verify)
- Update [apps/customer-app/app/(auth)/login.tsx](../../apps/customer-app/app/%28auth%29/login.tsx) to render the Apple button only on iOS:
  ```tsx
  {Platform.OS === 'ios' && <AppleSignInButton />}
  ```
- Same for driver-app + business-app login screens

### Step 5 — App Store listing per app
- Screenshots (6 sizes: 6.5", 5.5", 5.5" iPad Pro, etc.)
- Privacy nutrition labels (what data, how used, shared with whom)
- Age rating questionnaire (SEIRS is 18+ at registration so likely 17+ rating)
- Privacy policy URL: https://seirs.app/privacy-policy
- Support URL: https://seirs.app/contact
- Marketing copy in 4 langs (en/yo/ig/ha — we have the CMS infrastructure now)

### Step 6 — TestFlight closed beta
- Add 10–20 internal testers
- Run for **at least 7 days** before submitting to production
- Catch any iOS-specific bugs (Safari WebView for Flutterwave checkout, push notification edge cases)

### Step 7 — App Review submission
- Apple's review timeline: typically 24–48 hours for first submission, 1–2 weeks for first-version delays
- Common rejection causes for Nigerian fintech apps:
  - Missing in-app purchase for any "premium" upgrades (SEIRS Plus subscription will need IAP integration on iOS — Apple takes 30% cut, plan accordingly)
  - Insufficient demo credentials (provide a working test account in the review notes)
  - Permission-string ambiguity (camera, location, push)
- Have a rejection-response playbook: most rejections need a one-paragraph clarification + resubmit, takes another 48 hours

### Step 8 — Production launch
- Set `NEXT_PUBLIC_APP_STORE_URL` on Vercel — the [AppStoreBadges](../../apps/seirs-website/src/components/AppStoreBadges.tsx) component will flip from "Coming soon" to live
- Post launch notice to `/news` via admin CMS
- Update Spec V8 memory: "iOS launched on YYYY-MM-DD"

---

## SEIRS Plus subscription + Apple's 30% cut

Spec V8 §"Tier 2" plans a **₦2,000/month SEIRS Plus consumer subscription**. On iOS this MUST go through Apple's in-app purchase system, where Apple takes 30% in year 1 (drops to 15% in year 2+).

Workarounds (legal but use carefully):
1. **Charge subscription only on web** (apps direct to seirs.app/subscribe). Standard Apple-compliant pattern.
2. **Different pricing on iOS** — bump iOS subscription to ₦2,500/month to recover the 30%. Make sure ToS allows.
3. **Free on Android, premium on iOS only** — non-starter for product equity.

The cleanest plan: web-only subscription with deep link from inside the iOS app to your hosted subscription page.

---

## Estimated total cost

| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| D-U-N-S Number registration (Nigeria) | Free |
| Initial iOS build setup time | 1–2 dev weeks |
| TestFlight beta + bug-fix iteration | 1–2 weeks elapsed |
| App Review + potential rejection cycle | 1–2 weeks elapsed |
| **Total elapsed time from trigger to live**: 6–10 weeks |

---

## Documentation when iOS lands

After iOS goes live, update:
- [ ] `seirs-app/seirs-map.html` — add iOS node statuses to the subway map
- [ ] [`project_seirs`](../../../../Users/Seye_xiv/.claude/projects/c--FlutterProjects/memory/project_seirs.md) memory — "iOS launched YYYY-MM-DD, Apple Developer team ID: XXXX"
- [ ] This doc — mark as DONE not DEFERRED
