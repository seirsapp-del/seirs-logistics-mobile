# Production Observability (Sentry + Uptime)

**Status:** code shipped in bucket 15, awaiting Sentry account + DSNs before it starts capturing.

This doc covers the manual setup needed to flip observability from "wired but silent" to "actively reporting".

---

## Why observability matters at launch

Without Sentry + uptime monitoring:
- First production bug is invisible until a customer/driver complains via support
- Cannot diff release-vs-release error rates after each EAS update or Railway deploy
- No way to know if the Flutterwave webhook is silently failing for 1% of payments
- Cannot demonstrate to regulators (FCCPA, NITDA) that we monitor for security incidents

With it:
- Errors surface within seconds, tagged by app + route + user
- Stack traces from production (with source maps) instead of "user said it crashed"
- Webhook failures, payment exceptions, and DB constraint violations all hit a single inbox
- Replays of admin sessions for support-driven debugging

---

## Sentry projects to create

Sign up at https://sentry.io (free tier covers 5k events/month — fine for launch).

Create **6 projects** under one org:

| Project name | Platform | DSN env var |
|---|---|---|
| `seirs-backend` | Node | `SENTRY_DSN` (server-side only) |
| `seirs-admin` | Next.js | `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` |
| `seirs-website` | Browser | `NEXT_PUBLIC_SENTRY_DSN` |
| `seirs-customer` | React Native | — reports via backend telemetry |
| `seirs-driver` | React Native | — reports via backend telemetry |
| `seirs-business` | React Native | — reports via backend telemetry |

**Note on the mobile apps:** they don't ship the Sentry SDK natively (that would require an EAS rebuild). Instead the shared `errorReporter` POSTs to the backend's `POST /api/v1/_telemetry/error`, which tags events with `app: customer|driver|business` and forwards to Sentry server-side. To split mobile errors into per-app Sentry projects, set the `tags.app` filter on each Sentry alert rule + dashboard.

---

## Environment variables to set

### Backend (Railway → seirs-backend)
```
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=$RAILWAY_GIT_COMMIT_SHA   # already set by Railway
SENTRY_TRACES_SAMPLE_RATE=0.1            # 10% perf traces
SENTRY_PROFILES_SAMPLE_RATE=0.1
```

### Admin dashboard (Vercel → seirs-admin)
```
NEXT_PUBLIC_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<admin-project>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA
# Source map upload (server-only, never in NEXT_PUBLIC_*)
SENTRY_ORG=seirs
SENTRY_PROJECT=seirs-admin
SENTRY_AUTH_TOKEN=<get from sentry.io/settings/account/api/auth-tokens/>
```

### Website (Vercel → seirs-website)
```
NEXT_PUBLIC_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<website-project>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

Mobile apps need no env vars — they auto-discover via the API_BASE config.

---

## How to verify each surface is reporting

After setting DSNs and redeploying:

1. **Backend**: hit any endpoint that throws (e.g. send a malformed body to `POST /api/v1/auth/login`). Confirm a 5xx event appears in Sentry within 30 sec, tagged with `route` + `method`.
2. **Admin dashboard**: open browser devtools, paste `Sentry.captureMessage('admin test')` into the console. Confirm receipt.
3. **Website**: navigate to https://seirs.app, paste the same console snippet. Confirm receipt under the website project.
4. **Customer/driver/business apps**: trigger a deliberate error (e.g. tap a button wired to `throw new Error('test')`). The error POSTs to `/api/v1/_telemetry/error` → forwarded to Sentry with `app: customer` tag.

Add a `/__sentry-test` admin-only page later for repeatable smoke tests.

---

## Source map upload

The admin dashboard's `withSentryConfig` automatically uploads source maps during `next build` when `SENTRY_AUTH_TOKEN` is set. Without source maps, production stack traces show minified function names like `t.handleSubmit` — useless for debugging.

For the website (static export), source maps are not auto-uploaded by `@sentry/browser`. Add this to the Vercel build step if needed:
```bash
npx @sentry/cli sourcemaps upload --org seirs --project seirs-website .next/static/
```

For the backend, NestJS compiles to plain JS in `dist/` — no minification, no source map upload needed.

---

## Alert rules to set up

In each Sentry project, create:

| Rule | Threshold | Action |
|---|---|---|
| **New issue (first seen)** | Any | Email founder + post to `#seirs-alerts` Slack |
| **Error spike** | >10 events of same issue in 5 min | Page on-call |
| **Regression** | Issue marked resolved reopens | Email founder |
| **Performance degradation** | P95 latency >2× baseline for 10 min | Email founder |

For the backend project specifically:
- Webhook handler failures (tag `route:flutterwave-webhook`) → page immediately, regardless of count
- Auth failures > 100/min (tag `route:auth.*` + status 401) → SOC alert (possible credential stuffing)

---

## Uptime monitoring (Better Stack)

Sign up at https://betterstack.com/uptime (free tier: 10 monitors, 3-min check interval).

Create monitors for:

| URL | Check | Cadence | Alert if |
|---|---|---|---|
| `https://api.seirs.co/api/v1/health` | HTTP 200 + body contains `"status":"ok"` | 60s | Down 2× in a row |
| `https://app.seirs.co` (website) | HTTP 200 | 60s | Down 2× in a row |
| `https://admin.seirs.co` (admin) | HTTP 200 or 401 (login wall) | 60s | Down 2× in a row |
| `https://api.seirs.co/api/v1/health/db` | HTTP 200 + body contains `"db":"up"` | 60s | Down (any) |
| `https://api.seirs.co/api/v1/health/redis` | HTTP 200 | 120s | Down 3× in a row |

Alert channels:
- Founder's phone (SMS + push via Better Stack app)
- `#seirs-incidents` Slack channel
- Email to support@seirs.co (paper trail)

Status page (optional but recommended): https://status.seirs.co (Better Stack provides free hosted status pages).

---

## Privacy + NDPR alignment

Sentry captures:
- ✅ Stack traces
- ✅ Browser context (URL, viewport, user agent)
- ✅ App context (release, environment)
- ❌ User IDs (we tag with internal user UUID only, never email/phone)
- ❌ Request bodies (Sentry's default behavior — we don't override)
- ❌ Authorization headers (stripped in `beforeSend`)
- ❌ Cookies (stripped in `beforeSend`)

For the website session replay (admin only), `maskAllText: true` + `blockAllMedia: true` ensures no PII is captured even in replays — replays show layout only.

Update the privacy policy to disclose:
- Sentry (Functional Software Inc., USA) — error logs, no PII
- Better Stack (Better Stack s.r.o., EU) — uptime checks, no user data

Add to `apps/seirs-website/src/app/privacy-policy/page.tsx` under "Third-party processors".

---

## Cost forecast

| Service | Tier | Cost |
|---|---|---|
| Sentry | Team (50k events/mo) | $26/mo when launched |
| Better Stack | Pro (50 monitors, 30s interval) | $25/mo when launched |
| **Total** | | **~$51/mo** (₦80k) |

Free tiers (5k events, 10 monitors @ 3min) work for the first 30 days of launch — upgrade before week 2 if event volume exceeds 1k/day.

---

## Post-launch playbook

Week 1: stay on Sentry's "Issues" page during business hours. Triage every new error.

Week 2-4: build per-app dashboards:
- Backend: requests/sec, p95 latency by route, error rate
- Admin: page load p95, route transitions
- Mobile: crash-free session % (calc from `app` tag counts)

Month 2+: weekly observability review on Mondays. Track:
- Top 10 issues by event count → which are real bugs vs noise
- Crash-free rate per app — target >99.5%
- Webhook failure rate — target 0 (any non-zero is an incident)
- Uptime % — target 99.9% (43 min downtime/month)

---

## When this doc is DONE

- [ ] All 6 Sentry projects created + DSNs in env vars
- [ ] Test event captured in each project
- [ ] Alert rules configured per project
- [ ] Better Stack monitors live with founder phone alerts
- [ ] Privacy policy updated with Sentry + Better Stack as processors
- [ ] First weekly observability review held
- [ ] Mark this doc as DONE not "code shipped, setup pending"
