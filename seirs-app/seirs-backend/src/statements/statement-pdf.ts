import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

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
  code:         string;
  verifyUrl:    string;
  issuedNote?:  string;          // "Issued by SEIRS support on request"
}

const naira = (n: number) =>
  'NGN ' + Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dmy = (d: string | Date) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')} ${x.toLocaleString('en-GB', { month: 'short' })} ${x.getFullYear()}`;
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
  doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold')
     .text('SEIRS', 44, 30, { characterSpacing: 5 });
  doc.fontSize(8).font('Helvetica').fillColor('#8FA8C7')
     .text('LOGISTICS', 44, 56, { characterSpacing: 3 });
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

  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('EARNED, NOT YET PAID', 220, y);
  doc.fillColor('#B45309').fontSize(17).font('Helvetica-Bold').text(naira(input.totalPendingNgn), 220, y + 13);

  doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold')
     .text('ENTRIES', 430, y, { width: 121, align: 'right' });
  doc.fillColor(INK).fontSize(17).font('Helvetica-Bold')
     .text(String(input.lines.length), 430, y + 13, { width: 121, align: 'right' });

  y += 52;

  // ── Lines ────────────────────────────────────────────────────────────
  const COL = { date: 44, narrative: 128, status: 372, amount: 440 };
  const header = () => {
    doc.rect(44, y - 4, 507, 20).fill('#F3F4F6');
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold');
    doc.text('DATE', COL.date + 4, y + 2);
    doc.text('DETAIL', COL.narrative, y + 2);
    doc.text('STATUS', COL.status, y + 2);
    doc.text('AMOUNT', COL.amount, y + 2, { width: 107, align: 'right' });
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
    if (line.settled) running += Number(line.amountNgn);

    doc.fillColor(INK).text(dmy(line.date), COL.date + 4, y, { width: 80 });
    doc.fillColor(INK).text(line.narrative, COL.narrative, y, { width: 238 });
    doc.fillColor(line.settled ? '#15803D' : '#B45309')
       .text(line.settled ? 'paid' : line.status, COL.status, y, { width: 64 });
    doc.fillColor(INK).font('Helvetica-Bold')
       .text(naira(line.amountNgn), COL.amount, y, { width: 107, align: 'right' });
    doc.font('Helvetica');

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
     .text('Verify this statement', 142, vy + 14);
  doc.fillColor(MUTED).fontSize(8.5).font('Helvetica')
     .text(
       'A PDF can be edited. Do not trust this document on its appearance. Scan the code or ' +
       'open the link below to see the figures SEIRS actually issued. If they differ from this ' +
       'page, this page is not genuine.',
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
         `Statement ${input.code}  ·  SEIRS Logistics, Lagos, Nigeria  ·  Page ${i - range.start + 1} of ${range.count}` +
         (input.issuedNote ? `  ·  ${input.issuedNote}` : ''),
         44, 790, { width: 507, align: 'center' },
       );
  }

  doc.end();
  return done;
}
