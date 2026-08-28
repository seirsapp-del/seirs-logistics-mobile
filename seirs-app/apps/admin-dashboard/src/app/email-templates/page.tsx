'use client';
/**
 * The email screen is the gallery now.
 *
 * What was here: a sidebar of template slugs beside a textarea of raw
 * HTML, with a preview its own code called "rough" because it dropped
 * the body into a div with no header, banner, colour, footer or table
 * layout. The founder's spec, agreed 2026-08-27 and not built until
 * 2026-08-28, was a gallery of real designs with colours and images, the
 * ability to build new ones, seasonal cases including birthdays, a
 * scheduler, and a non-technical person editing text and seeing the
 * actual email rather than markup.
 *
 * The gallery, creation, the seasonal set and the true preview live in
 * EmailGallery. The scheduler is the remaining piece.
 */
export { default } from './EmailGallery';
