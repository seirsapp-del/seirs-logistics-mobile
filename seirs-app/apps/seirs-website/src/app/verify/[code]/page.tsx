import type { Metadata } from 'next';
import { VerifyView } from './VerifyView';

/**
 * Server shell for statement verification.
 *
 * Every statement PDF SEIRS issues prints this URL and tells the reader,
 * in the document's own words: "Scan the code or open the link below to
 * see the figures SEIRS actually issued. If they differ from this page,
 * this page is not genuine."
 *
 * That instruction shipped on 19 August and the route it points at never
 * existed, so following it returned a 404. A bank officer doing exactly
 * what the document asked would have concluded the statement was forged.
 * A document that fails its own authenticity check is worse than one
 * that never offered the check at all (found 2026-09-01).
 *
 * Deliberately NOT a redirect to the API. Handing somebody raw JSON
 * fails the same test for a different reason: it does not look like an
 * answer from the company that issued the paper.
 */

interface Props { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const clean = decodeURIComponent(code ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return {
    title: clean ? `Verify ${clean}` : 'Verify a statement',
    description:
      'Check a SEIRS statement against the figures SEIRS issued. No account needed.',
    // A verification code identifies one company's or one rider's
    // earnings for a period. Same reasoning as tracking codes: anybody
    // holding the code can see the totals, so these must never turn up
    // in a search result.
    robots: { index: false, follow: false },
  };
}

export default function VerifyStatementPage() {
  return <VerifyView />;
}
