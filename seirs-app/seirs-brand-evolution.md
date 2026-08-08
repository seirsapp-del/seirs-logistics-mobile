# The SEIRS Brand — How It Was Born

*A record of how the SEIRS logo, wordmark, app icon and splash screen
came to be — from the first rough idea to the final mark. Kept because
every brand has an origin story, and one day this one will be worth
telling.*

Finalised 2026-05-20.

---

## Where it started — the three-vehicle badge

The first real logo concept ("Concept F") was a circular navy badge with
**three Nigerian vehicles stacked vertically**:

- **Okada** (motorcycle) on top
- **Keke** (tricycle) in the middle
- **Danfo** (commuter bus) at the bottom

The thinking: SEIRS is Nigerian-first. Okada, keke and danfo are the
brand's own vocabulary — transport types Uber, Bolt and inDrive can't
claim. Reading top-to-bottom even matched the pricing tiers: small and
cheap up top, large and group-sized at the bottom. The whole brand
promise in one mark.

It was a good idea. But three vehicles in one badge is a lot to carry.

## The pivot — one okada, not three

Looking at the badge, the verdict was simple: **"the design at the top
is the one I like."** The okada.

So the okada was pulled out on its own — no circle, no keke, no danfo.
Just the rider, the bike, and a small yellow package: a delivery, in one
glyph. That became the SEIRS mark.

## The dead-ends (every brand has them)

Not every direction worked. The ones that were tried and rejected:

- **The thin stick-figure okada** — too faint. *"The lines are like
  sticks, people may not notice it."*
- **A soft Pantone palette** (Cloud Dancer, Veiled Vista, Baltic Sea…) —
  pretty, but wrong for a logistics platform. *"Delete those designs."*
- **Eight multi-colour "Gmail-spectrum" mixes** — a different colour for
  every part of the bike. None landed.
- **A navy pill behind the home-screen logo** — too heavy. *"Too much
  navy background."*
- **An over-bold icon revision** — pushed the strokes too far. *"You did
  the wrong thing."*

Each dead-end narrowed the path. That's what dead-ends are for.

## The refinements that stuck

- **A geometric grid + uniform strokes** — the okada was redrawn so every
  line had the same weight and snapped to a clean grid. The goal was a
  mark that looked like it belonged to a ten-year-old company on day one.
- **Bolder** — thin strokes became 3.5px, wheels filled in solid, the
  rider got more presence. *"Better now."*
- **Simplified** — the yellow package was removed for a cleaner
  silhouette; space was opened between the rider's hand and the front
  wheel so the bike could breathe.
- **A warmer navy** — `#0F2B4C` → `#0E2540`. A small shift, but it reads
  less cold, more trustworthy.

## The app icon

Seven background colours were tested — navy, yellow, sky blue, orange,
white, black — each shown sitting next to real apps (Camera, Maps,
Phone) to see which actually stood out on a home screen.

The winner: **Option F — white background, navy okada.** Clean,
high-contrast, unmistakable. Then made bigger and bolder so it holds its
own next to any other app.

## The wordmark — the long way round to the obvious answer

The "SEIRS" wordmark took the most detours.

It started as the phone's plain system font — which read as low-effort,
*"like a customer would think we didn't try."* So the hunt began: 5
Google Fonts, then **34 fonts**, traced and compared side by side.

The 34-font experiment twice broke the app. And the verdict on all of
them: *"the rest of the 34 fonts was just a waste — I didn't like any."*

The answer had been there the whole time. The font in the splash mock-up
that felt right — the one that was never in the 34 — was **Roboto
Black**, the plain system font. It just needed to be *committed to*.

So "SEIRS" was **traced from Roboto into a permanent SVG path** — the
exact letterforms, baked into vector, no font file loaded at runtime.
The same way Stripe, Linear and Vercel draw their wordmarks. It renders
pixel-identical on every phone, forever.

## The splash screen

Three launch-screen layouts were drawn up:

- Stacked — okada above, SEIRS below
- Stacked with a tagline
- **Horizontal — okada, then SEIRS, with the tagline tucked under the
  wordmark**

The horizontal one won. The okada faces right — so it reads as the bike
*pointing at* the brand name, delivering it. The tagline sits directly
under "SEIRS": **"Logistics, simplified."**

## Where it landed

The final SEIRS brand:

- **The mark** — a geometric monoline okada: a rider on a motorcycle,
  navy on white, built on a clean grid with uniform strokes.
- **The wordmark** — "SEIRS" in Roboto Black, traced to a static vector
  path. Identical on every device, zero dependencies.
- **The lockup** — okada + "SEIRS" + "Logistics, simplified.", the bike
  pointing at the name.
- **The colours** — navy `#0E2540`, white, and a warm yellow `#FFBE0B`
  held in reserve.
- **The app icon** — the okada, navy on white, bold.
- **The splash** — the full lockup on white.

Everything is vector. Nothing depends on a font that could fail to load.
The brand renders the same on the cheapest Android phone and the newest
iPhone.

It took a three-vehicle badge, a stick figure, a Pantone palette, eight
colour mixes, a navy pill, and thirty-four fonts to arrive at something
simple. That's usually how it goes.

---

*Asset sources live in `seirs-icon-*.svg`, `scripts/generate-icons.js`,
`scripts/generate-splash.js`, `scripts/trace-brand-wordmark.js`, and
`apps/customer-app/components/SeirsLogoV2.tsx` + `SeirsWordmark.tsx`.
Full variant-by-variant history is in this repo's git log.*
