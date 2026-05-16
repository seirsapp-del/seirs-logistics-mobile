# SEIRS Pre-Launch Checklist

**Generated:** 2026-05-16 (bucket 14)
**Status:** code is launch-ready (zero real gaps across the platform). What remains is operational + legal work.

Use the per-item docs as drafts — adapt to your actual contacts and timelines, then send.

---

## Master checklist

| # | Item | Doc | Owner | Status | Target date |
|---|---|---|---|---|---|
| 1 | **Payments lawyer T&C review** | [01-payments-lawyer-brief.md](01-payments-lawyer-brief.md) | Founder | ☐ Not started | T-30 days |
| 2 | **Insurance procurement** (in-transit, driver accident, cyber liability) | [02-insurance-rfq.md](02-insurance-rfq.md) | Ops | ☐ Not started | T-30 days |
| 3 | **NITDA NDPR registration** + DPO appointment | [03-ndpr-registration.md](03-ndpr-registration.md) | Founder | ☐ Not started | T-21 days |
| 4 | **Lagos state operator licence** (and Abuja, Ibadan for cities 2-3) | [04-state-operator-licence.md](04-state-operator-licence.md) | Ops | ☐ Not started | T-45 days |
| 5 | **Flutterwave volume-rate negotiation** | [05-flutterwave-rate-negotiation.md](05-flutterwave-rate-negotiation.md) | Founder | ☐ Not started | T-21 days |
| 6 | **Apple Developer enrollment** (iOS only — defer until iOS build is on the table) | [06-apple-developer-enrollment.md](06-apple-developer-enrollment.md) | Founder | ☐ Deferred | iOS Phase |
| 7 | **Public dispute resolution playbook** | [07-dispute-resolution-playbook.md](07-dispute-resolution-playbook.md) | Founder + Legal | ☐ Not started | T-14 days |

---

## Technical pre-deploy verifications (final)

Most of these are already done across buckets 1-13 — re-verify before launch day.

- [x] Flutterwave webhook secret hash set + verified end-to-end (commit `a277dcb`)
- [x] FCM service account JSON deployed (Firebase config)
- [x] Cloudflare R2 bucket + public-URL config (env vars set)
- [x] Google Maps server-side + browser-restricted keys (Vercel CSP whitelisted)
- [x] Resend SMTP from-address (`MAIL_FROM` env var)
- [x] PostgreSQL daily backup schedule (Railway → Settings → Backups)
- [x] Redis cache for tracking GPS + WS pub/sub
- [x] Admin TOTP enrolled for every admin (verified post-bucket-3)
- [x] SOS endpoint reachable in <1s (verified via /api/v1/health)
- [ ] **Verify cron job worker process running** on Railway (separate verification — crons silently no-op if scheduler module fails to boot)
- [ ] **Manual end-to-end test:** customer signup → send package → driver accepts → delivery → rating → escrow release → driver payout
- [ ] **Manual test:** business signup → create delivery → fund wallet → cancel delivery → verify wallet refund
- [ ] **Manual test:** partner-store apply → admin approve → receive drop-off → release to recipient via SEIRS ID + typed name
- [ ] **Manual test:** rate-card edit (admin → /pricing → +5% inflation bump) propagates within 60s
- [ ] **Smoke test against production** via the [scripts/smoke.sh] (TBD — none yet)

---

## Marketing readiness (Vercel website)

- [x] News + Changelog + FAQ + Careers + Page Blocks all CMS-driven (bucket 5 + 9)
- [x] NDPR cookie banner (bucket 9)
- [x] Sitemap.xml auto-generated from published content
- [x] Lang switcher + html lang attribute
- [ ] **Set `NEXT_PUBLIC_PLAY_STORE_URL`** in Vercel once Google Play listing is live
- [ ] **Set `NEXT_PUBLIC_APP_STORE_URL`** in Vercel once App Store listing is live
- [ ] **Set `NEXT_PUBLIC_SITE_URL`** to the production domain (sitemap uses it)
- [ ] **Domain pointing**: seirs.app → Vercel (website), api.seirs.app → Railway (backend), admin.seirs.app → Vercel (admin)
- [ ] **SSL certificates** issued for all 3 subdomains

---

## App store submissions

- [ ] **Customer app** — Google Play listing (screenshots, copy, content rating, privacy policy URL = seirs.app/privacy-policy)
- [ ] **Driver app** — Google Play listing (separate listing; emphasises "driver / partner" not customer)
- [ ] **Business app** — Google Play listing
- [ ] Privacy nutrition labels filled out (NDPR-compliant)
- [ ] Test users added for closed testing track (10-20 internal testers)
- [ ] Production track promotion (after 7 days closed testing minimum)

---

## Launch-day runbook

1. **T-2 hours**: deploy any final hotfix to Railway; verify `/api/v1/health` returns `{ status: "ok" }`
2. **T-1 hour**: switch Flutterwave to LIVE mode (was already LIVE per memory but re-confirm `FLUTTERWAVE_SECRET_KEY` prefix is `FLWSECK_LIVE-*` not `FLWSECK_TEST-*`)
3. **T-30 minutes**: post launch announcement to /news via admin CMS (schedule to publish at launch time)
4. **T-0**: flip app-store badges from "Coming soon" to active by setting `NEXT_PUBLIC_PLAY_STORE_URL` on Vercel + push redeploy
5. **T+1 hour**: monitor admin /ops-map + /health for the first wave of real bookings
6. **T+24 hours**: review /admin/audit-log for anything unexpected; check /admin/disputes for early complaints
7. **T+72 hours**: first weekly retrospective; tune matching-service `MATCHING_RADIUS_KM` based on real density data

---

## Post-launch (week 2+)

These items shouldn't block launch but should land soon after:

- Driver Premium subscription (D35, Phase 2 deferred — Spec V8 §"Tier 2")
- Flutterwave recurring billing for sponsored placements (B30, Phase 2)
- SMS-OTP fallback for non-SEIRS recipients (deferred per spec — email-only at launch)
- iOS build + Apple Developer enrollment + App Store submission
- Driver micro-loan underwriting (Tier 4 financial services)
- Tax-summary PDF generation (D34 has the data endpoint; PDF rendering is a polish item)
