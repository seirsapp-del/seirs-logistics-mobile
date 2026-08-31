/**
 * One typeface for SEIRS, on every phone.
 *
 * Until 2026-08-31 none of the three apps named a typeface at all, so each
 * one rendered in whatever font the handset was set to. On a Samsung with a
 * FlipFont installed that meant the whole driver app came up in a
 * handwriting script: prices, job cards, the tab bar, everything. Samsung is
 * a large share of the Nigerian market and FlipFont is a headline feature of
 * it, so this was never going to stay theoretical.
 *
 * Inter is bundled rather than requested, and it is the FULL family, not a
 * Google Fonts subset. The subset was tried first and rejected: it carries
 * no naira sign, so every price would have rendered as a tofu box, and it
 * drops the Hausa hooked letters and the Yoruba and Igbo dot-below vowels
 * that all three locale files are full of.
 *
 * Weight mapping is the awkward part. Registering five files gives five
 * family NAMES, while every StyleSheet in the codebase asks for a weight
 * (FontWeight.bold and friends). Rather than rewrite several hundred style
 * blocks the night before launch, the render of Text and TextInput is
 * wrapped once, here, and the weight is translated into the matching family.
 */
import React from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';

/** The five weights shipped in assets/fonts. Keep in step with useFonts. */
export const BRAND_FONT_FILES = [
  'Inter-Regular',
  'Inter-Medium',
  'Inter-SemiBold',
  'Inter-Bold',
  'Inter-Black',
] as const;

/**
 * fontWeight as written in the stylesheets, mapped to the file that really
 * carries that weight. Anything lighter than 400 resolves to Regular
 * because no lighter cut is bundled: a missing family falls back to the
 * system font, which is the whole problem being fixed.
 */
const FAMILY_BY_WEIGHT: Record<string, string> = {
  '100': 'Inter-Regular',
  '200': 'Inter-Regular',
  '300': 'Inter-Regular',
  '400': 'Inter-Regular',
  normal: 'Inter-Regular',
  '500': 'Inter-Medium',
  '600': 'Inter-SemiBold',
  '700': 'Inter-Bold',
  bold: 'Inter-Bold',
  '800': 'Inter-Bold',
  '900': 'Inter-Black',
};

/**
 * Apply Inter to every Text and TextInput that has not asked for something
 * else. Call once, at module scope in the root layout, before anything
 * renders.
 *
 * Returns false if React Native ever stops building these two out of
 * forwardRef, so a future upgrade shows up as a plain "fonts not applied"
 * rather than a crash on the first screen.
 */
export function installBrandFont(): boolean {
  const patch = (Component: any): boolean => {
    if (!Component || Component.__seirsFontPatched) return true;
    const original = Component.render;
    if (typeof original !== 'function') return false;

    Component.render = function patched(...args: any[]) {
      const el = original.apply(this, args);
      if (!React.isValidElement(el)) return el;

      const incoming = (el.props as any)?.style;
      const flat = StyleSheet.flatten(incoming) ?? {};

      // A caller that names its own family means it: the SEIRS ID is set in
      // monospace on purpose so the characters line up when read aloud.
      if ((flat as any).fontFamily) return el;

      const weight = (flat as any).fontWeight;
      const family = FAMILY_BY_WEIGHT[weight != null ? String(weight) : '400']
        ?? 'Inter-Regular';

      // fontWeight is cleared after the family is chosen. Left in place,
      // Android synthesises a bold on top of a file that is already bold
      // and the result is a smeared double weight.
      return React.cloneElement(el as any, {
        style: [{ fontFamily: family }, incoming, { fontWeight: undefined }],
      });
    };

    Component.__seirsFontPatched = true;
    return true;
  };

  return patch(RNText) && patch(RNTextInput);
}
