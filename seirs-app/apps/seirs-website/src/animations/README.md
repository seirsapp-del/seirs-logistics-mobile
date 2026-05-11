# Lottie animations for the SEIRS website

This folder holds Lottie JSON files for marketing-page animations.

## How to add one

1. Browse free animations at <https://lottiefiles.com/featured-free-animations>.
   Search for "delivery", "logistics", "package", "courier", etc.
2. Download the **Lottie JSON** (not the GIF or MP4 export).
3. Drop it in this folder, e.g. `delivery-flow.json`.
4. Import + use it in any page:

   ```tsx
   import deliveryFlow from "@/animations/delivery-flow.json";
   import { LottieAnimation } from "@/components/LottieAnimation";

   <LottieAnimation
     animationData={deliveryFlow}
     className="w-full max-w-md mx-auto"
   />
   ```

## Recommended placements (in order of impact)

| Page | What to look for |
|---|---|
| Homepage hero (right column, replace HeroIllustration) | "Delivery package travels on a stylized map" — 5-10s loop |
| `/how-it-works` after the StepCard list | "3-step icon flow: phone → motorcycle → checkmark" |
| `/for-drivers` near the earnings hero | "Money / wallet filling up" — emotional hook |
| `/for-partner-stores` near the earnings table | "Box being scanned + stamp + ₦ flying out" |

## Tips for keeping the brand look

- Recolour to the SEIRS palette (`#0F2B4C` navy, `#3A7BD5` sky) — use
  the colour-override in the lottiefiles editor before exporting,
  or hand-edit the JSON's `it` array (RGB values 0-1).
- Keep file size under 200 KB per animation. Anything bigger usually
  means the animation has too many frames or rasterised images
  baked in — pick a different one.
- Avoid animations that include text — text doesn't translate via the
  browser's auto-translate.

## Why this folder is empty right now

This is the first commit setting up Lottie infra. Free animations are
trivial to add later — no rebuild needed once the Next.js dev/prod
build is restarted. Drop in JSONs and ship.

## Live preview while sourcing

Visit [`/lottie-preview`](http://localhost:3000/lottie-preview) on your
running Next.js dev server. It auto-discovers every JSON in this folder
and renders them with size warnings + ready-to-paste import snippets.
Useful for trying 5 candidates and picking the best one before wiring
into a production page. Delete the route once production pages are wired.
