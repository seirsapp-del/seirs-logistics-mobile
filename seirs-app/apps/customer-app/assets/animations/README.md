# Lottie animations for the SEIRS customer app

Two ways to wire a Lottie animation into a screen:

## Option A — paste a URL (fastest, recommended)

1. Go to <https://lottiefiles.com/free-animations/delivery> (or search for
   any theme: "courier", "package", "high five", "celebration", etc.)
2. Pick an animation. On the right-hand panel, find **"Lottie Animation URL"**
   or **"Asset Link"** — that's a `.json` URL hosted on the lottiefiles CDN.
   Copy it.
3. Open the slot you want to animate and paste the URL string:
   - **Home hero:** [`apps/customer-app/app/(customer)/(tabs)/index.tsx`](../../app/\(customer\)/\(tabs\)/index.tsx)
     — set `HERO_LOTTIE = 'https://lottie.host/.../anim.json';`
   - **/send wizard + empty states:** [`apps/customer-app/components/Illustration.tsx`](../../components/Illustration.tsx)
     — under `LOTTIE_REGISTRY`, set the slot to the URL string
4. Hot reload. The animation streams from the lottiefiles CDN, caches on
   first load, plays automatically.

No download step. No bundler hot restart. Works for a quick visual check
before deciding which animations to commit to long-term.

## Option B — bundle the JSON locally (better for offline / production)

When you've picked an animation you want to keep:

1. Same lottiefiles page → **Download → Lottie JSON**
2. Save into THIS folder with a clear name (e.g. `delivery-hero.json`)
3. Replace the URL string in the slot with a require:
   ```ts
   HERO_LOTTIE = require('@/assets/animations/delivery-hero.json');
   // or in the registry:
   'send-package': require('@/assets/animations/send-package.json'),
   ```
4. Animation ships in the app bundle — works offline, no first-load
   network request, costs you whatever the JSON's file size is (usually
   30-150 KB each).

## Naming convention

Match the slot key the screen asks for. Current Phase 1 slots:

| Slot key                | Used on                  | Suggested lottiefiles search |
|-------------------------|--------------------------|------------------------------|
| `HERO_LOTTIE`           | Home page navy hero      | "delivery", "courier scooter"|
| `send-package`          | /send Step 1             | "packing", "open box"        |
| `send-address`          | /send Step 2             | "map pin", "location"        |
| `send-vehicle`          | /send Step 3             | "scooter", "delivery"        |
| `send-fare`             | /send Step 4             | "invoice", "calculator"      |
| `send-confirm`          | /send Step 5             | "high five", "deal"          |
| `empty-no-active`       | Home — no active tab     | "waiting", "watching window" |
| `empty-no-deliveries`   | Home + /history empty    | "empty box", "first package" |
| `empty-no-cards`        | /payment-methods empty   | "credit card", "wallet"      |

## Brand fit tips

- Look for animations with a clean white/transparent background — they
  sit on `theme.surface` (light) or `theme.surfaceSecond` (dark) and
  shouldn't fight your card colors.
- 4-8 second loops feel best. Anything shorter looks twitchy; anything
  longer feels heavy.
- Avoid embedded text — the app is multilingual (en/yo/ha/ig) and the
  baked-in English would clash.
- Prefer "human character + object" over "object only" — humans-in-motion
  is what makes the app feel alive (per the project's design memo).

## License

LottieFiles' free animations are free for commercial use without
attribution. See <https://lottiefiles.com/page/license> for the full terms.

## Phase 2 wishlist (when those screens land)

| Slot key                | Used on                    |
|-------------------------|----------------------------|
| `onboarding-send`       | Onboarding screen 1        |
| `onboarding-track`      | Onboarding screen 2        |
| `onboarding-rewards`    | Onboarding screen 3        |
| `booking-success`       | Post-confirm interstitial  |
| `driver-assigned`       | Trip-progress assigned step|
| `sos-illustration`      | /sos hero                  |
