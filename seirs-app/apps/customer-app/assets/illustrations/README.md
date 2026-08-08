# SEIRS customer-app illustrations

This folder holds SVG illustrations used by the `<Illustration>` component.
Drop a file in here with the exact filename below, register it in
`components/Illustration.tsx`, and it renders automatically on the screen
that asks for that name.

## How to source

We use [unDraw](https://undraw.co/illustrations) as the v1 illustration set.

1. Open <https://undraw.co/illustrations>.
2. **Set the brand colour** (top-right colour picker) to `#0F2B4C` —
   SEIRS navy. Every illustration on the site will recolor live.
3. Find the illustration you need (search terms in the table below).
4. Click **Download → SVG**.
5. Save into THIS folder with the exact filename below.
6. Hot reload — the screen swaps from the placeholder to your SVG.

unDraw is free for commercial use with no attribution required.
See <https://undraw.co/license> for the full license terms.

## Required filenames (Phase 1)

The `<Illustration name="..." />` calls in code map to these filenames.
Anything missing renders a soft navy-tinted placeholder so screens
never break — but please fill them in before launch.

| Filename                        | Used on screen        | Suggested unDraw search    |
|---------------------------------|-----------------------|----------------------------|
| `send-package.svg`              | /send Step 1 Package  | "package box" / "open box" |
| `send-address.svg`              | /send Step 2 Address  | "address" / "location"     |
| `send-vehicle.svg`              | /send Step 3 Vehicle  | "scooter" / "delivery"     |
| `send-fare.svg`                 | /send Step 4 Fare     | "calculator" / "receipt"   |
| `send-confirm.svg`              | /send Step 5 Confirm  | "high five" / "deal"       |
| `empty-no-active.svg`           | /home — no active     | "waiting" / "relaxing"     |
| `empty-no-deliveries.svg`       | /home + /history empty| "package" / "first box"    |
| `empty-no-cards.svg`            | /payment-methods empty| "credit card" / "wallet"   |

## How to register a new illustration

Open `apps/customer-app/components/Illustration.tsx` and add the file to
the `REGISTRY` object:

```ts
import sendPackage from '@/assets/illustrations/send-package.svg';

const REGISTRY = {
  'send-package': sendPackage,
  // ...add new ones here
};
```

That's the entire wiring — no metro restart needed beyond the first
SVG you add (which triggers metro to pick up the transformer).

## Sizing & dark mode

- Phase 1 default sizes: `140px` on wizard steps, `120px` on empty states.
- Pre-recoloured navy works on light surfaces. Dark mode uses the same
  SVG — it has a transparent background so it sits on the dark surface
  just fine. If contrast is an issue on a specific illustration, save
  a second copy as `<name>-dark.svg` and the component will use it.

## Phase 2 (not in code yet)

When these are ready, drop them in:

| Filename                        | Used on screen                |
|---------------------------------|-------------------------------|
| `onboarding-send.svg`           | Onboarding screen 1           |
| `onboarding-track.svg`          | Onboarding screen 2           |
| `onboarding-rewards.svg`        | Onboarding screen 3           |
| `booking-success.svg`           | Post-confirm interstitial     |
| `sos-illustration.svg`          | /sos hero                     |
| `help-payment.svg`              | Help → Payments category card |
| `help-deliveries.svg`           | Help → Deliveries card        |
| `help-account.svg`              | Help → Account card           |

## A longer-term option

For brand differentiation, commission a custom 30-pack of Nigerian-themed
illustrations (okada / keke / danfo / market scenes) from a local
illustrator — budget around ₦200k per the project memo. Drop them in here
under the same filenames and they replace unDraw with zero code change.
