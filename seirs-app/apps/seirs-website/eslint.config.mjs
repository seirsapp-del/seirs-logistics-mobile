import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * ESLint config for the marketing site, added 2026-08-23 with W-M14.
 *
 * next.config.ts had eslint.ignoreDuringBuilds: true, and this app had no
 * eslint dependency and no config of its own, so `next build` never linted
 * anything. With the suppression removed, ESLint walked up out of the repo
 * and picked up C:/FlutterProjects/eslint.config.js, the Expo config that
 * belongs to the mobile apps, and failed to load it. A config here stops the
 * upward walk and gives this app its own rules.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals'),
];
