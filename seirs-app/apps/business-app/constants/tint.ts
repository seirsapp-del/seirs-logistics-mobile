/**
 * Semantic tint pairs: the fix for item 5 of the 2026-08-24 night work
 * order, business-app.
 *
 * WHAT WENT WRONG. Badges, pills and status chips across this app were
 * coloured by taking a saturated brand hex and appending a two-digit
 * alpha: '#16A34A18', '#D9770622', `statusColor + '20'`. Every one of
 * those was chosen while looking at ONE theme, and they were all chosen
 * in dark mode, because dark is the default and where all the work has
 * happened. The founder found the same pattern in the driver app on
 * 2026-08-24: over near-black the tint is the subtle glow it was
 * designed to be, and over the cream light background (#F5F5F0) it is
 * grey-green sludge.
 *
 * The measurable part is worse than the look. Composited over white or
 * cream, those tints leave the SAME-HUE text sitting on them at 2.3 to
 * 3.9:1. WCAG AA wants 4.5:1 for text this size, and a 13px bold pill is
 * not "large text". Measured before this change:
 *
 *   #9CA3AF18 grey pill, light      2.35:1
 *   #16A34A20 success circle, light 2.65:1
 *   #16A34A20 status badge, light   2.86:1
 *   #16A34A18 LIVE pill, light      2.96:1
 *
 * The same colours in dark mode measured 4.5 to 5.8:1, which is why
 * nobody caught this: the theme everyone tests in was the one that
 * happened to work.
 *
 * WHY A TOKEN AND NOT A BRANCH AT EACH CALL SITE. The work order is
 * explicit: "Prefer the token: a branch at every call site is how this
 * happened." A ternary on isDark next to every colour is the same
 * decision made 52 separate times, and the 53rd will be wrong too.
 *
 * TWO PROPERTIES THAT ARE NOT NEGOTIABLE:
 *
 *   1. Both values are OPAQUE hexes. Nothing here has an alpha channel.
 *      A translucent background under an Android `elevation` (any of
 *      Shadows.*) lets the elevation shadow show through unevenly and
 *      reads as a second box nested inside the first, which is the
 *      phantom-nested-box artifact from the same work order. An opaque
 *      fill cannot produce it, whatever is stacked on top.
 *
 *   2. bg and fg are chosen as a PAIR. Fixing the background alone does
 *      not fix the contrast: in light mode the tint has to get paler AND
 *      the text has to get darker. That is why fg is not the brand hue
 *      in light mode.
 *
 * Every pair below measures at least 4.95:1 in both themes.
 */

export type TintHue = 'green' | 'amber' | 'blue' | 'red' | 'grey' | 'purple';

export interface TintPair {
  /** Opaque surface for the pill, chip, badge or icon circle. */
  bg: string;
  /** Text or icon colour to use ON that surface. Never the brand hue in
   *  light mode: that is the half of the pairing that was failing. */
  fg: string;
}

const LIGHT: Record<TintHue, TintPair> = {
  green:  { bg: '#DCFCE7', fg: '#166534' },  // 6.49:1
  amber:  { bg: '#FEF3C7', fg: '#92400E' },  // 6.37:1
  blue:   { bg: '#DBEAFE', fg: '#1E40AF' },  // 7.15:1
  red:    { bg: '#FEE2E2', fg: '#991B1B' },  // 6.80:1
  grey:   { bg: '#E5E7EB', fg: '#4B5563' },  // 6.10:1
  purple: { bg: '#EDE9FE', fg: '#5B21B6' },  // 7.57:1
};

/**
 * Dark values are the composite the old alpha hexes were already
 * producing over the dark surface, frozen into an opaque hex. So dark
 * mode is deliberately unchanged to the eye: it was the theme that
 * worked, and this pass is not a redesign of it.
 */
const DARK: Record<TintHue, TintPair> = {
  green:  { bg: '#12291C', fg: '#3FB950' },  // 6.08:1
  amber:  { bg: '#2A2016', fg: '#F0883E' },  // 6.30:1
  blue:   { bg: '#16233A', fg: '#58A6FF' },  // 6.22:1
  red:    { bg: '#2C1719', fg: '#F87171' },  // 6.10:1
  grey:   { bg: '#21262D', fg: '#8B949E' },  // 4.95:1
  purple: { bg: '#221B39', fg: '#A78BFA' },  // 6.01:1
};

/** The pill/chip/badge colours for one semantic hue in the live theme. */
export function tint(hue: TintHue, isDark: boolean): TintPair {
  return (isDark ? DARK : LIGHT)[hue];
}

/**
 * Delivery status to hue, so a status badge can be tinted without every
 * screen keeping its own copy of the mapping.
 *
 * picked_up and in_transit share purple: they are the same thing to a
 * sender ("it is moving") and were already drawn the same colour.
 */
const STATUS_HUE: Record<string, TintHue> = {
  pending:    'amber',
  assigned:   'blue',
  picked_up:  'purple',
  in_transit: 'purple',
  delivered:  'green',
  failed:     'red',
  cancelled:  'grey',
};

export function statusTint(status: string | undefined, isDark: boolean): TintPair {
  return tint(STATUS_HUE[String(status ?? '')] ?? 'grey', isDark);
}
