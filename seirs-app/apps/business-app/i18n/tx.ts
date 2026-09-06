import i18n from './index';

/**
 * Translate outside a hook.
 *
 * Screens that were written with English straight in the layout are
 * converted to keys with this helper (2026-09-06), so they can live in the
 * translation files without each nested component growing a hook. The
 * English text stays in the call as the fallback, so a key the translator
 * has not reached yet still reads correctly. Mounted screens pick up a
 * language change through the root layout, which remounts the navigator
 * when the language changes.
 */
export const tx = (key: string, fallback: string, vars?: Record<string, unknown>): string =>
  String(i18n.t(key, { defaultValue: fallback, ...(vars ?? {}) }));
