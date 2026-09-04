/**
 * pdfkit ships as CommonJS and this project does not enable
 * esModuleInterop, so a default import compiles to `pdfkit_1.default`,
 * which is undefined at runtime: "pdfkit_1.default is not a
 * constructor". require gets the callable itself.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
import * as QRCode from 'qrcode';

/**
 * Who issued this document.
 *
 * ONE constant, read by the footer of every statement type. When the
 * registered address, the CAC number and the real domain arrive, they are
 * edited here and every future statement is correct: customer, driver,
 * business and partner at once.
 *
 * The Wise statement the founder sent as the reference names its regulator,
 * its company number and its registered office on EVERY page. That is not
 * decoration. It is what lets a stranger holding the document decide it is
 * real, which is the entire job of a statement used as proof of income or
 * of address. Ours says "Lagos, Nigeria".
 *
 * Nulls are printed as nothing rather than as a placeholder. A footer
 * reading "RC: TBC" is worse than a footer without one.
 */
export const ISSUER = {
  name:      'Seirs Logistics',
  city:      'Lagos, Nigeria',
  // NEEDS_DATA. Tracked in the website's LAUNCH_CHECKLIST alongside the
  // domain and the phone line.
  address:   null as string | null,   // full registered address
  rcNumber:  null as string | null,   // CAC registration number
  helpUrl:   null as string | null,   // "Need help? Visit ..." , Wise ends on one
  phone:     null as string | null,
};

/** The footer line, built from whatever ISSUER actually has today. */
function issuerLine(): string {
  return [ISSUER.name, ISSUER.address ?? ISSUER.city, ISSUER.rcNumber ? `RC ${ISSUER.rcNumber}` : null]
    .filter(Boolean)
    .join(', ');
}

const NAVY  = '#0F2B4C';
const BLUE  = '#3A7BD5';
const INK   = '#111827';
const MUTED = '#6B7280';
const RULE  = '#E5E7EB';

export interface StatementLine {
  date:       string | Date;
  narrative:  string;
  amountNgn:  number;
  status:     string;
  settled:    boolean;
}

export interface StatementInput {
  title:        string;          // "Partner Counter Earnings"
  subjectName:  string;          // shop or driver name
  subjectMeta?: string;          // store code, plate, etc
  periodFrom:   Date;
  periodTo:     Date;
  lines:        StatementLine[];
  totalPaidNgn:    number;
  totalPendingNgn: number;
  /**
   * Heading over the second total, or null to leave it off the page.
   *
   * "EARNED, NOT YET PAID" is an earner's sentence and it was printed
   * unconditionally. On a spend statement it is wrong twice: a business
   * pays rather than earns, and the figure would read NGN 0.00 because
   * unsettled charges are excluded by policy, which states that nothing
   * is outstanding when something may well be. Null omits the block.
   */
  pendingLabel?: string | null;
  code:         string;
  verifyUrl:    string;
  issuedNote?:  string;          // "Issued by SEIRS support on request"
}

const naira = (n: number) =>
  'NGN ' + Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Months spelled out here rather than through toLocaleString.
 *
 * en-GB via CLDR renders September as "Sept", four letters, while every
 * other month is three, so a document issued in September carried
 * "Issued 01 Sept 2026" above a period reading "01 Jul to 31 Aug". Worse
 * than the raggedness, the output depends on the ICU build in whatever
 * container rendered it, so the same statement could format differently
 * on Railway and on a laptop. A document people are asked to check
 * against a record should not shift with the runtime.
 */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dmy = (d: string | Date) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS_SHORT[x.getMonth()]} ${x.getFullYear()}`;
};

/**
 * Draw a diagonal watermark across the current page.
 *
 * Deterrence only. It makes an altered copy obvious at a glance and
 * discourages screenshot-and-edit, but it is not what makes the document
 * trustworthy: the verification code is. Kept light enough that the
 * figures stay readable when printed.
 */
function watermark(doc: PDFKit.PDFDocument, text: string) {
  doc.save();
  doc.rotate(-32, { origin: [300, 420] });
  doc.fontSize(58).fillColor('#000000').opacity(0.05)
     .text(text, -40, 380, { width: 800, align: 'center' });
  doc.opacity(1).restore();
}

/**
 * Render a statement as a PDF buffer.
 *
 * Generated on the server, never assembled on a phone: a document the
 * client builds is a document the client can quietly change before
 * anyone sees it.
 */
/**
 * The okada, drawn rather than embedded.
 *
 * The statement carried no mark at all: a document that is meant to be proof
 * of income, with nothing on it identifying who issued it but the word SEIRS
 * set in Helvetica. Vector rather than a PNG so it stays crisp at any size and
 * the backend needs no binary asset shipped alongside it.
 *
 * Geometry is the founder's locked pick, identical to
 * scripts/build-mark-assets.js: A3 weight, run D at 15.94, head at 13.3
 * degrees off vertical. Ink box is 42 wide by 36.48 tall, x from 3, y from
 * -5.48. The hubs are painted in the ground colour because the band behind is
 * solid, which is the same result the asset cutter gets by punching alpha.
 */
function drawOkada(
  doc: PDFKit.PDFDocument,
  x: number, y: number, h: number,
  ink: string, ground: string,
) {
  const INK_W = 42, INK_H = 36.48, INK_X = 3, INK_Y = -5.48;
  const s = h / INK_H;
  doc.save();
  doc.translate(x - INK_X * s, y - INK_Y * s).scale(s);
  doc.lineCap('round').lineJoin('round');
  doc.path('M 10 24 L 18 16 L 30 16 L 38 24').lineWidth(5.5).stroke(ink);
  doc.circle(10, 24, 7).fill(ink);
  doc.circle(38, 24, 7).fill(ink);
  doc.moveTo(37, 12).lineTo(42, 9).lineWidth(5.5).stroke(ink);
  doc.moveTo(24, 16).lineTo(31.13, 1.74).lineWidth(5.5).stroke(ink);
  doc.circle(31.82, -1.18, 4.3).fill(ink);
  doc.moveTo(29.35, 5.30).lineTo(37, 12).lineWidth(5.5).stroke(ink);
  doc.circle(10, 24, 2.4).fill(ground);
  doc.circle(38, 24, 2.4).fill(ground);
  doc.restore();
}
export async function renderStatementPdf(input: StatementInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const qrDataUrl = await QRCode.toDataURL(input.verifyUrl, { margin: 0, width: 220 });
  const qrBuffer  = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  // ── Header band ──────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 92).fill(NAVY);
  drawOkada(doc, 44, 30, 32, '#FFFFFF', NAVY);
  doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold')
     .text('SEIRS', 90, 30, { characterSpacing: 5 });
  doc.fontSize(8).font('Helvetica').fillColor('#8FA8C7')
     .text('LOGISTICS', 90, 56, { characterSpacing: 3 });
  doc.fillColor('#FFFFFF').fontSize(13).font('Helvetica-Bold')
     .text(input.title, 300, 34, { width: 258, align: 'right' });
  doc.fontSize(8.5).font('Helvetica').fillColor('#C7D6E8')
     .text(`Issued ${dmy(new Date())}`, 300, 54, { width: 258, align: 'right' });

  watermark(doc, 'SEIRS');

  // ── Who and when ─────────────────────────────────────────────────────
  let y = 118;
  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('STATEMENT FOR', 44, y);
  doc.fillColor(INK).fontSize(14).font('Helvetica-Bold').text(input.subjectName, 44, y + 13);
  if (input.subjectMeta) {
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(input.subjectMeta, 44, y + 32);
  }

  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold')
     .text('PERIOD', 360, y, { width: 198, align: 'right' });
  doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
     .text(`${dmy(input.periodFrom)} to ${dmy(input.periodTo)}`, 360, y + 13, { width: 198, align: 'right' });

  y += 62;
  doc.moveTo(44, y).lineTo(551, y).lineWidth(1).strokeColor(RULE).stroke();

  // ── Totals ───────────────────────────────────────────────────────────
  y += 16;
  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('PAID IN PERIOD', 44, y);
  doc.fillColor('#15803D').fontSize(17).font('Helvetica-Bold').text(naira(input.totalPaidNgn), 44, y + 13);

  // Omitted entirely when the caller passes null: a total nobody can
  // interpret is worse than a gap on the page.
  const pendingLabel = input.pendingLabel === undefined ? 'EARNED, NOT YET PAID' : input.pendingLabel;
  if (pendingLabel !== null) {
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text(pendingLabel, 220, y);
    doc.fillColor('#B45309').fontSize(17).font('Helvetica-Bold').text(naira(input.totalPendingNgn), 220, y + 13);
  }

  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold')
     .text('ENTRIES', 430, y, { width: 121, align: 'right' });
  doc.fillColor(INK).fontSize(17).font('Helvetica-Bold')
     .text(String(input.lines.length), 430, y + 13, { width: 121, align: 'right' });

  y += 52;

  // ── Lines ────────────────────────────────────────────────────────────
  /**
   * A running balance on every row.
   *
   * The founder sent a Wise statement as the reference and asked what made it
   * read as authoritative. This is most of it. A list of amounts is a list; a
   * column that accumulates down the page is an ACCOUNT, and that difference
   * is what a landlord or a loan officer is reading for. The figure was
   * already being computed for the total at the bottom and simply never
   * shown.
   *
   * Five columns inside the same 507pt of usable width, so DETAIL loses room
   * rather than anything being pushed off the page.
   */
  const COL = { date: 44, narrative: 110, status: 288, amount: 344, running: 446 };
  const header = () => {
    doc.rect(44, y - 4, 507, 20).fill('#F3F4F6');
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold');
    doc.text('DATE', COL.date + 4, y + 2);
    doc.text('DETAIL', COL.narrative, y + 2);
    doc.text('STATUS', COL.status, y + 2);
    doc.text('AMOUNT', COL.amount, y + 2, { width: 92, align: 'right' });
    doc.text('RUNNING', COL.running, y + 2, { width: 105, align: 'right' });
    y += 22;
  };
  header();

  let running = 0;
  doc.font('Helvetica').fontSize(9);
  for (const line of input.lines) {
    if (y > 700) {
      doc.addPage();
      watermark(doc, 'SEIRS');
      y = 60;
      header();
      doc.font('Helvetica').fontSize(9);
    }
    /* Only settled money moves the running balance. An entry still clearing
       is shown, because the rider earned it, but counting it would put a
       figure on the page that the bank has not seen. */
    if (line.settled) running += Number(line.amountNgn);

    doc.fillColor(INK).text(dmy(line.date), COL.date + 4, y, { width: 62 });
    doc.fillColor(INK).text(line.narrative, COL.narrative, y, { width: 172 });
    doc.fillColor(line.settled ? '#15803D' : '#B45309')
       .text(line.settled ? 'paid' : line.status, COL.status, y, { width: 52 });
    doc.fillColor(INK).font('Helvetica-Bold')
       .text(naira(line.amountNgn), COL.amount, y, { width: 92, align: 'right' });
    /* Muted, and not bold. It is context for the amount beside it, not a
       second figure competing with it. */
    doc.fillColor(MUTED).font('Helvetica')
       .text(line.settled ? naira(running) : '-', COL.running, y, { width: 105, align: 'right' });
    doc.fillColor(INK).font('Helvetica');

    y += 16;
    doc.moveTo(44, y - 3).lineTo(551, y - 3).lineWidth(0.5).strokeColor('#F3F4F6').stroke();
  }

  if (input.lines.length === 0) {
    doc.fillColor(MUTED).fontSize(10).font('Helvetica-Oblique')
       .text('No entries in this period.', 44, y + 6, { width: 507, align: 'center' });
    y += 30;
  }

  // ── Running total ────────────────────────────────────────────────────
  y += 8;
  doc.moveTo(44, y).lineTo(551, y).lineWidth(1).strokeColor(RULE).stroke();
  y += 10;
  doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
     .text('Total paid in period', COL.narrative, y);
  doc.fillColor('#15803D').fontSize(12)
     .text(naira(running), COL.amount, y - 2, { width: 107, align: 'right' });

  // ── Verification block ───────────────────────────────────────────────
  const vy = Math.max(y + 40, 660);
  doc.rect(44, vy, 507, 96).fillAndStroke('#F9FAFB', RULE);
  doc.image(qrBuffer, 56, vy + 12, { width: 72, height: 72 });
  doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
     .text('Confirm this statement online', 142, vy + 14);
  doc.fillColor(MUTED).fontSize(8.5).font('Helvetica')
     .text(
       'Every Seirs statement can be checked independently. Scan the code, or open the link ' +
       'below, to see these same figures on our website. No account and no sign-in is needed, ' +
       'so anyone you show it to can confirm it for themselves.',
       142, vy + 30, { width: 396 },
     );
  doc.fillColor(BLUE).fontSize(8.5).font('Helvetica-Bold')
     .text(input.verifyUrl, 142, vy + 72, { width: 396, link: input.verifyUrl, underline: false });

  // ── Footer on every page ─────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
       .text(
         `Statement ${input.code}  ·  ${issuerLine()}  ·  Page ${i - range.start + 1} of ${range.count}` +
         (input.issuedNote ? `  ·  ${input.issuedNote}` : ''),
         44, 782, { width: 507, align: 'center', lineBreak: false },
       );
  }

  doc.end();
  return done;
}
