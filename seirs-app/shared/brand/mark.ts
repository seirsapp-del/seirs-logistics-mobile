/**
 * The SEIRS okada mark, as numbers, in one place.
 *
 * WHY THIS FILE EXISTS. The geometry was living in six places and four of
 * them had drifted: scripts/build-mark-assets.js (the cutter, correct),
 * the website's SeirsLogo.tsx (correct), the admin dashboard's
 * SeirsLogo.tsx (stroke 3.5, outlined wheels, old drawing), and
 * SeirsLogoV2.tsx in all three apps (stroke 2, r5 outlined wheels with
 * spokes, an even older drawing). So the launcher icon, the splash and
 * the mark drawn inside the app were three different okadas, and the
 * founder saw it (2026-09-05: "everywhere our logo is").
 *
 * THE GEOMETRY is the founder's locked pick of 30 August 2026: A3 weight,
 * run D stretched to 15.94, lean 63.4 degrees, even frame, no wordmark,
 * with the two corrections approved on 3 September:
 *
 *   1. Torso stroke 6.0 -> 5.5, because at 6.0 its round cap reached
 *      y=19.00 while the frame rail's underside is at 18.75, so a lobe
 *      hung below the frame directly under the rider.
 *   2. Head from (31.13, -1.26) to (31.82, -1.18). It sits 3.0 from the
 *      torso's tip and used to sit straight up while the torso arrives at
 *      26.57 degrees off vertical, so the neck met the skull at a
 *      different angle on each side. Now offset 13.3 degrees, half the
 *      lean.
 *
 * Dots 1 to 9 of the founder's Okada Dot-to-Dot are untouched.
 *
 * ANYONE DRAWING THE MARK READS FROM HERE. scripts/build-mark-assets.js
 * cuts the PNGs from the same numbers, so the icon in the launcher and
 * the mark in the top bar cannot drift apart again.
 */

/** Stroke for the frame, arm, handlebar and torso. */
export const MARK_SW = 5.5;
/** Wheel radius, filled. */
export const MARK_WHEEL_R = 7.0;
/** Hub radius. Punched out of the PNG assets, drawn in the hub colour on screen. */
export const MARK_HUB_R = 2.4;
/** The rider's head. */
export const MARK_HEAD_R = 4.3;
/** Dot 10, the head centre, at 13.3 degrees off the torso. */
export const MARK_HEAD = { x: 31.82, y: -1.18 } as const;

/** The frame: rear hub, up over the seat, along the rail, down to the front hub. */
export const MARK_FRAME_D = 'M 10 24 L 18 16 L 30 16 L 38 24';

/** Both wheel centres. */
export const MARK_WHEELS = [
  { x: 10, y: 24 },
  { x: 38, y: 24 },
] as const;

/** Handlebar, torso, and the arm reaching for the bars. */
export const MARK_LINES = [
  { x1: 37,    y1: 12,   x2: 42,    y2: 9    },   // handlebar
  { x1: 24,    y1: 16,   x2: 31.13, y2: 1.74 },   // torso
  { x1: 29.35, y1: 5.30, x2: 37,    y2: 12   },   // arm
] as const;

/**
 * The ink extent, in mark units: left edge the rear wheel, right the front
 * wheel, top the head, bottom the wheels. Used as the viewBox so the mark
 * fills its box with no invented padding.
 */
export const MARK_VIEWBOX = {
  x: 10 - MARK_WHEEL_R,                       //  3.0
  y: MARK_HEAD.y - MARK_HEAD_R,               // -5.48
  w: (38 + MARK_WHEEL_R) - (10 - MARK_WHEEL_R), // 42.0
  h: (24 + MARK_WHEEL_R) - (MARK_HEAD.y - MARK_HEAD_R), // 36.48
} as const;

/** Height for a given rendered width, keeping the mark's true ratio. */
export function markHeightFor(width: number): number {
  return width * (MARK_VIEWBOX.h / MARK_VIEWBOX.w);
}

/** The viewBox attribute string, ready to drop into an <svg>. */
export const MARK_VIEWBOX_ATTR =
  `${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.w} ${MARK_VIEWBOX.h}`;

/** Brand colours the mark is allowed to use. */
export const MARK_NAVY  = '#0A1F38';
export const MARK_CLOUD = '#F5F5F0';
