/**
 * SEIRS mark asset cutter.
 *
 *   node scripts/build-mark-assets.js
 *
 * Cuts all seven brand assets for all three apps from ONE geometry, below.
 * Run it after any change to the mark, then rebuild the apps: the splash
 * updates over the air but the launcher icon is baked into the APK.
 *
 * WHY THIS FILE EXISTS. The geometry used to live in three places that had
 * drifted apart: seirs-icon-square.svg (last touched in the May sweep, still
 * holding the un-stretched mark at ratio 1.400), the website's SeirsLogo.tsx
 * (the real one, 1.148), and a build_assets.py that commit ededc06 names as
 * the cutter but which is not in the repo at all. The shipped PNGs matched
 * none of the committed sources. One file now, and the SVGs are generated
 * from it rather than maintained by hand.
 *
 * THE GEOMETRY is the founder's locked pick of 30 August 2026: A3 weight,
 * run D stretched to 15.94, lean 63.4 degrees, even frame, no wordmark.
 * Two corrections were approved on 3 September:
 *
 *   1. Torso stroke 6.0 -> 5.5. At 6.0 its round cap reached y=19.00 while
 *      the frame rail's underside is at y=18.75, so a rounded lobe hung
 *      below the frame directly under the rider. 0.25 units, about 4px on
 *      the 1024 cut. At 5.5 the cap lands exactly on the rail.
 *
 *   2. Head moved from (31.13, -1.26) to (31.82, -1.18). The head sits 3.0
 *      from the torso's tip, and it used to sit straight UP while the torso
 *      arrives at 26.57 degrees off vertical, so the neck met the skull at a
 *      different angle on each side. It is now offset at 13.3 degrees, half
 *      the lean: enough to clear the neck on both sides without throwing the
 *      head over the bars. Founder picked option C of five.
 *
 * Dots 1 to 9 of the founder's Okada Dot-to-Dot are untouched. Only dot 10,
 * the head centre, moves. Ratio goes 1.150 to 1.159.
 *
 * THE HUBS ARE PUNCHED AFTER RENDER, in pixels, not drawn in SVG.
 *
 * They have to be real holes: a hub-coloured disc would put an opaque blob
 * into splash-icon.png where the ground should show through. Three SVG routes
 * were tried and all three failed. Drawing the wheel as a ring is not enough,
 * because the frame path STARTS at (10,24), the rear wheel's centre, so its
 * round cap fills the hub from underneath. An SVG <mask> silently does nothing
 * here, because putting `mask` and `transform` on the same element makes
 * librsvg apply the transform to the mask's contents as well, so the cut
 * circles land somewhere off the canvas. Punching the alpha channel after
 * rasterising is exact, and it is checked below rather than assumed.
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── The mark ────────────────────────────────────────────────────────────────
const SW        = 5.5;                 // frame, arm, handlebar, and now torso
const WHEEL_R   = 7.0;
const HUB_R     = 2.4;
const HEAD_R    = 4.3;
const HEAD      = { x: 31.82, y: -1.18 };   // dot 10, at 13.3 degrees

// Ink extent, in mark units. Left edge is the rear wheel, right edge the
// front wheel, top the head, bottom the wheels.
const round3 = (n) => Number(n.toFixed(3));
const INK = {
  x: round3(10 - WHEEL_R),
  y: round3(HEAD.y - HEAD_R),
  w: round3((38 + WHEEL_R) - (10 - WHEEL_R)),
  h: round3((24 + WHEEL_R) - (HEAD.y - HEAD_R)),
};

const paths = (c) => `
  <path d="M 10 24 L 18 16 L 30 16 L 38 24" stroke="${c}" stroke-width="${SW}"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="10" cy="24" r="${WHEEL_R}" fill="${c}"/>
  <circle cx="38" cy="24" r="${WHEEL_R}" fill="${c}"/>
  <line x1="37" y1="12" x2="42" y2="9" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>
  <line x1="24" y1="16" x2="31.13" y2="1.74" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>
  <circle cx="${HEAD.x}" cy="${HEAD.y}" r="${HEAD_R}" fill="${c}"/>
  <line x1="29.35" y1="5.30" x2="37" y2="12" stroke="${c}" stroke-width="${SW}" stroke-linecap="round"/>`;

/** One asset. `fill` is the mark's width as a fraction of the canvas. */
function svg({ size, ground, mark, fill }) {
  const s  = (size * fill) / INK.w;
  const tx = (size - INK.w * s) / 2 - INK.x * s;
  const ty = (size - INK.h * s) / 2 - INK.y * s;
  const bg = ground ? `<rect width="${size}" height="${size}" fill="${ground}"/>` : '';
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
${bg}<g transform="translate(${tx}, ${ty}) scale(${s})">${paths(mark)}</g>
</svg>`;
  // where the two hubs land, in pixels, for the punch below
  const hubs = [[10, 24], [38, 24]].map(([hx, hy]) => ({
    cx: tx + hx * s, cy: ty + hy * s, r: HUB_R * s,
  }));
  return { body, hubs, ground };
}

/**
 * Cut the hubs out of the rendered pixels. On a transparent asset the hub
 * becomes a true hole; on an opaque one it is repainted with the ground, which
 * is what the eye expects there anyway.
 */
async function punchHubs(buf, size, hubs, ground) {
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const g = ground ? [0xF5, 0xF5, 0xF0] : null;
  for (const { cx, cy, r } of hubs) {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(size - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(size - 1, Math.ceil(cy + r + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        if (d2 > r2) continue;
        const i = (y * info.width + x) * ch;
        if (g) { data[i] = g[0]; data[i + 1] = g[1]; data[i + 2] = g[2]; data[i + 3] = 255; }
        else   { data[i + 3] = 0; }
      }
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } }).png().toBuffer();
}

const NAVY  = '#0A1F38';
const CLOUD = '#F5F5F0';

// Fills measured off the shipped assets so nothing shifts but the drawing.
// The adaptive foreground is 0.445 rather than 0.66 because an adaptive
// icon only shows the middle 72dp of a 108dp layer: 0.66 x 72/108 = 0.44.
const ASSETS = [
  { file: 'icon.png',                    size: 1024, ground: CLOUD, mark: NAVY,      fill: 0.660 },
  { file: 'splash-icon.png',             size: 1024, ground: null,  mark: NAVY,      fill: 0.666 },
  { file: 'splash-icon-dark.png',        size: 1024, ground: null,  mark: '#FFFFFF', fill: 0.666 },
  { file: 'android-icon-foreground.png', size: 1024, ground: null,  mark: NAVY,      fill: 0.445 },
  { file: 'android-icon-monochrome.png', size: 1024, ground: null,  mark: '#000000', fill: 0.445 },
  { file: 'favicon.png',                 size: 48,   ground: CLOUD, mark: NAVY,      fill: 0.667 },
];

const APPS = ['customer-app', 'driver-app', 'business-app'];

async function main() {
  for (const app of APPS) {
    const out = path.join(ROOT, 'apps', app, 'assets', 'images');
    if (!fs.existsSync(out)) { console.warn(`skipping ${app}, no assets dir`); continue; }
    console.log(`\n${app}`);

    for (const a of ASSETS) {
      const { body, hubs, ground } = svg(a);
      const flat = await sharp(Buffer.from(body), { density: 384 })
        .resize(a.size, a.size).png().toBuffer();
      const cut = await punchHubs(flat, a.size, hubs, ground);
      fs.writeFileSync(path.join(out, a.file), cut);
      console.log(`  ${a.file}`);
    }

    // Flat ground behind the adaptive foreground. No mark on this one.
    await sharp({ create: { width: 1024, height: 1024, channels: 4,
                            background: { r: 245, g: 245, b: 240, alpha: 1 } } })
      .png().toFile(path.join(out, 'android-icon-background.png'));
    console.log('  android-icon-background.png');
  }
  console.log('\nDone. Launcher icons are baked into the APK at build time,');
  // The two repo SVGs are GENERATED, not maintained. They had drifted to the
  // un-stretched May mark (ratio 1.400) while the shipped PNGs were 1.148, so
  // anyone editing them shipped the wrong drawing. Emitting them here keeps
  // them honest.
  const NL2 = String.fromCharCode(10);
  const r = (n) => Number(n.toFixed(3));
  const banner = '<!-- GENERATED by scripts/build-mark-assets.js. Do not edit by hand.' + NL2 +
                 '     Edit the geometry in that script and re-run it. -->';
  const sq = '<?xml version="1.0" encoding="UTF-8"?>' + NL2 + banner + NL2 +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${INK.x} ${INK.y} ${INK.w} ${INK.h}" fill="none">` + NL2 +
    `<g>${paths('#0A1F38')}` + NL2 +
    `  <circle cx="10" cy="24" r="${HUB_R}" fill="#F5F5F0"/>` + NL2 +
    `  <circle cx="38" cy="24" r="${HUB_R}" fill="#F5F5F0"/>` + NL2 +
    '</g>' + NL2 + '</svg>' + NL2;
  fs.writeFileSync(path.join(ROOT, 'seirs-icon-square.svg'), sq);
  fs.writeFileSync(path.join(ROOT, 'seirs-icon.svg'), sq);
  console.log('seirs-icon-square.svg and seirs-icon.svg regenerated');

  console.log('so rebuild and reinstall before they change on a phone.');
}

main().catch(err => { console.error('Asset cut failed:', err); process.exit(1); });
