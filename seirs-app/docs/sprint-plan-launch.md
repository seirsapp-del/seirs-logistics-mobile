# SEIRS 2-week public launch sprint plan

**Locked in:** 2026-08-08
**Target public launch date:** 2026-08-22
**Scope:** All 3 apps (customer + driver + business) live on Google Play Store, backend on Railway paid tier, admin dashboard on Vercel, website on Vercel. Optional App Store submission. see risk section.

---

## Realistic budget check

Working days: **10 business days** (2026-08-11 through 2026-08-22, excluding weekends).
Total dev hours available assuming solo/small team + Claude: ~60–80 hours.
Store review latency (Google Play): 1–3 days, cannot be shortcut.

**This plan is aggressive. Every day matters. One bad discovery cascades.** If any day slips, the launch date slips by the same amount. Consider moving to **soft launch (Play Store internal testing track)** first if any of Days 1–5 are lost. see "Fallback plan" at the bottom.

---

## Day-by-day

### Day 1. Mon Aug 11 · Foundation

**Morning (4h):**
- Review overnight diff from Claude (this file, admin dashboard fixes, identity flow, referral hardening)
- Commit today's uncommitted work into 4–5 logical commits
- Push to `main`. check Vercel deploys admin dashboard successfully
- **Fix Railway cold-start (LAUNCH BLOCKER):**
  - Upgrade Railway plan to have min-instance ≥ 1 (kills 25s cold start)
  - OR set up UptimeRobot to ping `/api/v1/config/rate-card` every 4 min
  - Verify: hit endpoint after 10 min of inactivity, expect < 500ms response

**Afternoon (4h):**
- Boot driver-app on phone via `npx expo run:android` (Metro + adb reverse. Claude's dev routine)
- Walk driver golden path: signup → KYC upload → go online → accept trip → complete → withdraw earnings
- Log every issue found; fix any that block the golden path
- Repeat: boot business-app on phone, walk business golden path (create dispatch, view deliveries, add drivers, wallet)

**End-of-day expected state:**
- Railway cold-start: fixed
- 3 apps: verified booting + core flow working on real phone
- List of ~5–10 bugs discovered, ranked

### Day 2. Tue Aug 12 · Fix real-phone bugs

- Work through the bug list from Day 1, most-severe first
- Every fix: re-verify on phone (Metro hot-reload for JS, `expo run:android` for native)
- Cross-app rule ([[feedback_check_across_all_apps]]): each fix. check if same bug exists in the other apps

**End-of-day:** all P0/P1 bugs from real-phone testing fixed. P2/P3 triaged into "fix in Day 8" bucket.

### Day 3. Wed Aug 13 · Identity flow end-to-end

- Test the identity verification flow built overnight:
  - Customer app: /verify-identity → submit → status shows "under review"
  - Admin dashboard: /identity queue shows submission → doc + selfie visible → approve/reject works
  - Customer sees status update on next load (may need FCM push wired to be nicer)
- Wire FCM push to notify user on approval/rejection (adds real-time delight)
- If time: build admin bulk-approve UI

### Day 4. Thu Aug 14 · Referral system + wallet polish

- Wire `awardReferralBonusIfEligible` into the delivery-completion webhook
  - Trigger: when delivery status flips to DELIVERED, if `customer.referredByCode` is set, look up the referrer User and call the hardened function with `triggerDeliveryId`
- Test end-to-end: create 2 accounts, sign up account B with account A's code, complete a delivery worth ≥ ₦1000 with account B, verify A gets 200 pts + audit-log entry
- Fix any wallet edge cases (negative balance protection, withdraw minimums)
- Add "recent activity" feed to customer wallet screen

### Day 5. Fri Aug 15 · Terms + policy pages + NDPR

- Ensure `seirs.co/terms`, `seirs.co/privacy`, `seirs.co/refund-policy` are live
  - Play Store submission requires these URLs
  - NDPR compliance requires privacy page with data-handling disclosure
- Add cookie banner on website if not already there
- Verify: `GET /users/me/export` returns full NDPR data bundle (already built, just re-verify)
- Verify: `DELETE /users/me` soft-delete + 30-day grace works
- Copy pass across customer app: replace any "Coming Soon" dead-ends with either a real destination or a "Notify me" opt-in

### Day 6-7. Weekend Aug 16-17 · Buffer / rest

- Optional: catch-up on any Day 1–5 slip
- Recommended: one full day off. Momentum matters; burnout kills more launches than bugs.

### Day 8. Mon Aug 18 · Store assets + build

- Play Store assets:
  - App icons (already in `assets/images/icon.png`. regenerated in May)
  - Feature graphic (1024×500 JPG/PNG). needs designing if not done
  - Screenshots: 4–8 phone screenshots per app (customer, driver, business. that's 12–24 screenshots total)
  - Short description (80 chars), long description (4000 chars). for each app
  - Privacy policy URL
  - Data safety declaration
- Configure `eas.json` production profiles for each app (already exist per memory: EAS project IDs are wired)
- **First EAS builds** (this is where we spend the reserved cloud minutes):
  - `eas build --profile production --platform android` × 3 apps
  - Each build: 15–30 min queue + build. Total time: 45–90 min if sequential, or parallel if the tier allows
- Download the 3 signed APKs / AABs

### Day 9. Tue Aug 19 · Play Store submission

- Upload each AAB to its Play Console entry (customer + driver + business)
- Fill in store listing, screenshots, privacy, data safety
- Submit for review. **this is the 1–3 day wait we can't control**
- Meanwhile: set up crash monitoring alerts on Sentry (`@sentry/nextjs` already installed for admin, verify RN Sentry is set up for the mobile apps or add it)

### Day 10. Wed Aug 20 · Buffer for Play Store response + polish

- If Play Store rejects: fix per feedback, re-submit (each round adds 1–3 days)
- If approved / still in review: use the day for last-minute polish
- Test: install signed APK on a fresh phone (not the dev phone). catches "works on my machine" issues
- Test: hit backend from LTE (not wifi) to catch any hardcoded LAN IPs

### Day 11. Thu Aug 21 · Go/no-go + soft-launch to friends

- Decision: if Play Store approved AND real-phone smoke test passed AND all P0/P1 bugs fixed → GO
- If Play Store still in review → **launch to Play Store internal testing track** (100 testers, no review delay) as Plan B. Public launch bumps to Day 14 or later.
- Announce to close friends / early testers first (10–20 people)
- Monitor: Sentry error rate, Railway request rate, admin dashboard for weird sign-ups

### Day 12–14. Fri Aug 22 · Public launch + monitoring

- Push the app to public (if not already promoted from internal testing)
- Social media announcement (write in advance on Day 10)
- Monitor: Sentry errors, Railway CPU/memory, refund rate, driver-response-time metric
- Have a runbook for: banning fraud accounts, refunding failed deliveries, on-call cover for the first 48hrs

---

## Explicitly cut from this sprint

Move to v2 (weeks 3-6):
- **Insurance claims pipeline**. insurance stays `enabled: false` per existing config gate. Don't market as a feature.
- **Multi-stop autocomplete**. cargo booking through /multi-stop stays hidden until this lands
- **Hero cards CMS**. static `heroCards.ts` for launch; CMS is a future admin task
- **Full driver-app i18n**. driver app ships EN + YO only; HA + IG in week 3
- **Onboarding 3-screen flow**. first-launch intro deferred; users land on login/register
- **Bookmarks screen**. hook + storage already work; a dedicated /bookmarks screen is polish
- **Custom SEIRS map markers**. generic pins for launch; branded markers in v2
- **Splash screen animation**. static splash for launch
- **SOS screen visual redesign**. current SOS screen works; visual polish is post-launch
- **Live chat**. routes to /help ticket flow (already done); real chat is v2
- **Impersonate user for support**. needed but not launch-blocking
- **Bulk admin actions**. bulk-approve KYC etc.; single-item flow is fine at launch scale
- **Admin activity feed**. audit log per user exists; cross-user feed is v2
- **Shadow-ban**. hard ban only for launch

---

## Risk register

| Risk | Mitigation | Plan B |
|---|---|---|
| Play Store rejects (permissions, metadata) | Follow guidelines closely, test with `bundletool` first | Fix + resubmit; extends timeline by 1–3 days |
| Railway hits a payment/quota issue | Upgrade to paid tier BEFORE Day 1 (Day 0 task) | Have a backup deploy target (Fly.io, Render) documented |
| Real-phone bug that requires native module changes | Native rebuild is 15 min via `expo run:android` | Roll back to prior working commit; ship without the new feature |
| Fraud spike in first week (referral abuse) | The 7-gate `awardReferralBonusIfEligible` is in place; monitor `/admin/fraud` daily | Pause referral payouts via feature flag if abuse detected |
| Solo-founder burnout | Weekend rest, cut scope aggressively, don't chase Day 12+ | If burning out mid-week: pause launch, take 2 days, resume |

## Fallback plan. soft launch

If Days 1–5 slip badly, switch to **Play Store internal testing** track as the launch:
- No review delay (invite up to 100 testers instantly)
- Real users, real feedback, capped blast radius
- Promote to open testing (up to 20k testers) at Day 10, public at Day 20+
- Still counts as "launched" but avoids the store-review lottery

This is the SAFER path recommended by [[feedback_verify_before_claiming]]. you get real signal before committing to a public promise.

## App Store (iOS). NOT in this sprint

App Store review is more strict + slower (5–10 days typical). Attempting iOS in the same 2 weeks compounds risk. Recommended path:
- Ship Play Store first (Android is ~80% of Nigerian smartphone market)
- Test with real Play Store users for 2–4 weeks
- Then submit to App Store in month 2 with the same builds

---

## Ownership assumptions

- **Claude:** code changes, backend endpoints, admin dashboard polish, drafting copy, memory upkeep
- **User:** phone testing (plug in, walk flows, report bugs), Play Store account + submissions, marketing prep, on-call for launch week, all pushes to production
- **User does not touch the terminal** ([[project_seirs_dev_routine]]): Claude runs Metro, adb, gradle, EAS commands

---

## What to do TOMORROW MORNING

1. Read [morning-summary-2026-08-08.md](./morning-summary-2026-08-08.md)
2. Skim `git status`. 27 modified/new files from today, all uncommitted
3. Decide: commit as one big "Today's admin + identity + referral hardening" commit, OR split into 4–5 logical commits (I recommend the split for reviewability)
4. Push to main. Vercel picks up admin dashboard changes automatically
5. Manually deploy backend to Railway (Railway auto-deploys on push to main branch if configured. verify)
6. Once Railway has today's changes, boot the customer app on the phone and click "Verify Identity". you should now see the real submission screen instead of the coming-soon alert
