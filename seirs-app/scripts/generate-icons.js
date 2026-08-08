/**
 * SEIRS icon generator.
 *
 * Renders the SVG sources at the right sizes for Expo's icon contracts
 * and writes them into apps/customer-app/assets/images/. Run after any
 * edit to the SVG sources:
 *
 *   node scripts/generate-icons.js
 *
 * Sources:
 *   seirs-icon-square.svg      — full navy square (launcher icon)
 *   seirs-icon-foreground.svg  — transparent w/ white mark (Android adaptive foreground)
 *   seirs-icon.svg             — rounded-corner version (favicon)
 *
 * Outputs (per app — currently customer-app only; extend the apps[]
 * array to roll out to driver + business):
 *   icon.png                       1024×1024  (iOS + Android fallback)
 *   splash-icon.png                1024×1024  (Expo splash screen)
 *   android-icon-foreground.png    1024×1024  (Android adaptive foreground)
 *   android-icon-background.png    1024×1024  (solid navy fill)
 *   android-icon-monochrome.png    1024×1024  (mono white version for themed icons)
 *   favicon.png                      48×48    (web favicon)
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const ROOT = path.resolve(__dirname, '..');
// Adaptive-icon background colour. Option F uses WHITE so the navy
// foreground reads with maximum contrast (Apple-style high-contrast
// icon). Update both this AND app.json adaptiveIcon.backgroundColor
// if you ever change the icon's background.
const BG_COLOR = { r: 255, g: 255, b: 255, alpha: 1 };  // #FFFFFF

const apps = [
  'apps/customer-app/assets/images',
  // Uncomment to roll out to the other 2 apps:
  // 'apps/driver-app/assets/images',
  // 'apps/business-app/assets/images',
];

async function main() {
  const squareSvg     = fs.readFileSync(path.join(ROOT, 'seirs-icon-square.svg'));
  const foregroundSvg = fs.readFileSync(path.join(ROOT, 'seirs-icon-foreground.svg'));
  const roundedSvg    = fs.readFileSync(path.join(ROOT, 'seirs-icon.svg'));

  // Monochrome foreground — Android themed icons require a single
  // mono silhouette; the launcher fills it with the user's accent.
  // Strip the yellow package fill (becomes navy like the rest of the
  // mark) so the whole thing is a pure single-colour silhouette.
  const monoSvg = Buffer.from(
    foregroundSvg.toString().replace(/fill="#FFBE0B"/g, 'fill="#0E2540"')
  );

  for (const appDir of apps) {
    const out = path.join(ROOT, appDir);
    if (!fs.existsSync(out)) {
      console.warn(`Skipping ${appDir} (does not exist)`);
      continue;
    }
    console.log(`\nGenerating icons for ${appDir} …`);

    await sharp(squareSvg).resize(1024, 1024).png().toFile(path.join(out, 'icon.png'));
    console.log('  ✓ icon.png');

    await sharp(squareSvg).resize(1024, 1024).png().toFile(path.join(out, 'splash-icon.png'));
    console.log('  ✓ splash-icon.png');

    await sharp(foregroundSvg).resize(1024, 1024).png().toFile(path.join(out, 'android-icon-foreground.png'));
    console.log('  ✓ android-icon-foreground.png');

    // Solid 1024×1024 background fill for the Android adaptive icon
    // (colour set by BG_COLOR above — currently white for Option F).
    await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: BG_COLOR },
    }).png().toFile(path.join(out, 'android-icon-background.png'));
    console.log('  ✓ android-icon-background.png');

    await sharp(monoSvg).resize(1024, 1024).png().toFile(path.join(out, 'android-icon-monochrome.png'));
    console.log('  ✓ android-icon-monochrome.png');

    await sharp(roundedSvg).resize(48, 48).png().toFile(path.join(out, 'favicon.png'));
    console.log('  ✓ favicon.png');
  }

  console.log('\nDone. App icon assets regenerated.');
  console.log('Note: launcher icons are baked into the APK at build time —');
  console.log('      run `eas build` and reinstall for the change to show on phones.');
}

main().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
