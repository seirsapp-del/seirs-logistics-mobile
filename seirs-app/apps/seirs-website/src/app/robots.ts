import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/launch';

/**
 * There was no robots.ts and no public/robots.txt, so the sitemap was never
 * announced to anything: a crawler had to guess /sitemap.xml existed.
 *
 * /r/ and /collect/ are disallowed on purpose. Referral URLs carry a
 * person's account id and collect URLs carry a tracking code, which is
 * effectively a shared secret: anyone holding it can see the route. Neither
 * belongs in a search index. /track/[code] sets noindex in its own metadata
 * for the same reason, while /track itself stays crawlable because that is
 * the page recipients search for.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/r/', '/collect/', '/reset-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
