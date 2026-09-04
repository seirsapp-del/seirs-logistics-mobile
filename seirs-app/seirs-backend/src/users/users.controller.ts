import { Body, Controller, Delete, Get, Headers, Ip, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from './user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DocumentsService } from '../documents/documents.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly documents:    DocumentsService,
  ) {}

  // GET /api/v1/users/me
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return this.usersService.findById(user.id);
  }

  // PATCH /api/v1/users/me
  // Rate-limited to 3 changes per minute. legitimate users edit profile
  // rarely; higher rates are almost always abuse (bulk-rename bots or
  // impersonation attempts). Cool-down + name-content rules enforced in
  // service layer via UpdateProfileDto.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Patch('me')
  updateProfile(
    @CurrentUser() user: User,
    @Body() body: UpdateProfileDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.usersService.updateProfile(user.id, body, {
      actorRole: 'self',
      ipAddress: ip,
      userAgent: userAgent ?? null,
    });
  }

  // GET /api/v1/users/me/profile-changes
  // NDPR + user self-service: see your own history of profile edits.
  // Reassuring: users can see exactly what/when they (or admin) changed.
  @Get('me/profile-changes')
  getProfileAudit(@CurrentUser() user: User) {
    return this.usersService.getProfileAudit(user.id);
  }

  // DELETE /api/v1/users/me  { password, reason? }
  // NDPR right to erasure. Schedules a soft-delete 30 days out. The user
  // can cancel anytime before then via POST /users/me/cancel-deletion.
  // A daily cron picks up expired schedules and hard-deletes.
  @Delete('me')
  deleteAccount(
    @CurrentUser() user: User,
    @Body() body: { password: string; reason?: string },
  ) {
    return this.usersService.deleteAccount(user.id, body.password, body.reason);
  }

  // Cancel a pending self-scheduled deletion. Called from the customer app
  // banner. Returns a no-op message if there is no pending deletion.
  @Post('me/cancel-deletion')
  cancelDeletion(@CurrentUser() user: User) {
    return this.usersService.cancelDeletion(user.id);
  }

  /**
   * POST /api/v1/users/me/export/request
   *
   * The apps used to call GET me/export, THROW THE RESPONSE AWAY, and tell
   * the person "you will receive an email with the download link within 24
   * hours". No such email exists: no template, no queue, no cron. Anyone
   * exercising their NDPR Article 24 right got a reassuring message and
   * nothing else, permanently.
   *
   * So the copy is not the fix. The export is filed into the same Documents
   * shelf that already carries statements and letters, where it is viewable
   * and survives the app being closed. No mail transport, no file system,
   * no native module: the shelf and its viewer already exist.
   *
   * Rate limited to one per 24 hours because building the bundle walks
   * every delivery, payment and audit row the person owns, and a bored
   * thumb on that row is a free way to load the database.
   */
  @Throttle({ default: { limit: 3, ttl: 86_400_000 } })
  @Post('me/export/request')
  async requestExportToDocuments(@CurrentUser() user: User) {
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const mine = await this.documents.listMine(user.id).catch(() => [] as any[]);
    const last = (mine ?? []).find((d: any) => d?.category === 'other' && /your seirs data/i.test(d?.title ?? ''));
    if (last?.createdAt) {
      const age = Date.now() - new Date(last.createdAt).getTime();
      if (age < COOLDOWN_MS) {
        const hours = Math.max(1, Math.ceil((COOLDOWN_MS - age) / (60 * 60 * 1000)));
        return {
          ok: false,
          reason: 'cooldown',
          hoursRemaining: hours,
          message: `Your data is already in Documents. You can ask for a fresh copy in ${hours} hour${hours === 1 ? '' : 's'}.`,
        };
      }
    }

    const bundle = await this.usersService.exportUserData(user.id);
    /**
     * TEXT, not HTML. The Documents viewer renders body in a plain Text
     * view, so filing HTML here showed the person raw markup opening with
     * <!doctype html>, and sharing it shared the markup. The HTML build is
     * still what the apps turn into a PDF, and still what format=html
     * returns; it just does not belong in this field.
     */
    const text   = buildTextExport(bundle);
    const when   = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

    const doc = await this.documents.sendToUser(
      user.id,
      {
        title:    `Your SEIRS data, ${when}`,
        category: 'other',
        body:     text,
      },
      { id: undefined, name: 'SEIRS' },
    );

    return {
      ok: true,
      documentId: (doc as any)?.id ?? null,
      message: 'Your data is ready. Open Documents to read or share it.',
    };
  }

  // GET /api/v1/users/me/export?format=json|html|csv
  // NDPR Article 24 right to data portability. JSON is the default (machine
  // readable, meets the letter of the law). HTML is a printable copy the
  // user can save as a PDF. CSV flattens the deliveries table for anyone
  // who wants to open it in Excel.
  @Get('me/export')
  async exportData(
    @CurrentUser() user: User,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bundle = await this.usersService.exportUserData(user.id);
    const fmt = (format ?? 'json').toLowerCase();

    if (fmt === 'html') {
      /**
       * The service's formatter, not the one that used to live in this file.
       *
       * There were TWO HTML builders. formatExportAsHtml in users.service
       * reads bundle.profile, handles the deliveries object, covers payments,
       * store drop-offs, handovers and SOS alerts, and is styled in the SEIRS
       * navy with proper headings and a disclaimer. It was DEAD CODE, used
       * nowhere. The one wired in here read bundle.user, treated deliveries
       * as an array, and rendered browser-default HTML, so what people
       * actually received was an unstyled page with an empty profile and no
       * records. The good one had been sitting beside it the whole time.
       */
      const html = this.usersService.formatExportAsHtml(bundle);
      res.setHeader('Content-Type',        'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="seirs-export-${user.id}.html"`);
      return html;
    }

    if (fmt === 'csv') {
      const csv = buildCsvDeliveries(bundle);
      res.setHeader('Content-Type',        'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="seirs-deliveries-${user.id}.csv"`);
      return csv;
    }

    // Default: JSON (matches historical clients that don't pass a format).
    return bundle;
  }

  // GET /api/v1/users/me/notification-prefs
  @Get('me/notification-prefs')
  async getNotificationPrefs(@CurrentUser() user: User) {
    const u = await this.usersService.findById(user.id);
    return { prefs: u.notificationPrefs ?? {} };
  }

  // PUT /api/v1/users/me/notification-prefs  { prefs: { key: boolean } }
  @Patch('me/notification-prefs')
  updateNotificationPrefs(
    @CurrentUser() user: User,
    @Body() body: { prefs: Record<string, boolean> },
  ) {
    return this.usersService.updateNotificationPrefs(user.id, body.prefs);
  }
}

// ── NDPR export formatters ──────────────────────────────────────────────────
// Kept out of the service so the service returns the raw bundle (which the
// admin export endpoint uses too). Format conversion is a presentation
// concern that belongs at the controller layer.

function escapeHtml(s: any): string {
  const str = String(s ?? '');
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Two decimals everywhere, so the maths reconciles. */
function ngn(v: any): string {
  return Number(v ?? 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/**
 * The same export, as text a person can actually read on a phone.
 *
 * The Documents shelf renders a document's `body` in a plain Text view: it
 * has exactly two modes, inline text or a fileUrl it opens. HTML was filed
 * into it as body, so what a person saw when they asked for their own data
 * was raw markup, opening with <!doctype html>. Sharing it shared the markup
 * too. Found by the founder on 2026-09-04.
 *
 * So the shelf copy is text, which that viewer renders correctly today with
 * no new dependency, and the HTML is kept for the PDF the apps generate from
 * it and for anyone who asks for format=html.
 *
 * Deliberately mirrors the HTML section for section rather than inventing a
 * second layout, so the two never drift into disagreeing about what a
 * person's data is.
 */
function buildTextExport(bundle: any): string {
  /**
   * bundle.PROFILE, not bundle.user, and deliveries is an OBJECT.
   *
   * exportUserData returns { profile, deliveries: { asCustomer, asDriver } }.
   * The HTML builder below read bundle.user and treated deliveries as an
   * array, so every profile field printed blank and the count printed zero,
   * for everybody, since it was written. The founder opened his own export
   * and found "Name:" with nothing after it.
   *
   * I copied both mistakes into this function this afternoon by reading the
   * builder next to it instead of the thing that produces the data.
   */
  const user = bundle?.profile ?? {};
  const d = bundle?.deliveries ?? {};
  const deliveries: any[] = [
    ...(Array.isArray(d.asCustomer) ? d.asCustomer : []),
    ...(Array.isArray(d.asDriver)   ? d.asDriver   : []),
  ];
  const line = (label: string, value: any) => `  ${label.padEnd(10)} ${value ?? '-'}`;

  const out: string[] = [
    'YOUR SEIRS DATA',
    `Prepared ${new Date().toLocaleString('en-NG')}`,
    '',
    'This is your copy of what SEIRS holds about you, under NDPR Article 24.',
    '',
    'PROFILE',
    line('Name',     user.name),
    line('Email',    user.email),
    line('Phone',    user.phone),
    line('SEIRS ID', user.accountId),
    line('Joined',   user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-NG') : null),
    '',
    `DELIVERIES (${deliveries.length}${deliveries.length > 500 ? ', showing the most recent 500' : ''})`,
  ];

  if (deliveries.length === 0) {
    out.push('  None yet.');
  } else {
    for (const d of deliveries.slice(0, 500)) {
      out.push('');
      out.push(`  ${d.trackingCode ?? 'no code'}   ${d.status ?? ''}   NGN ${ngn(d.price)}`);
      out.push(`    ${d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : ''}`);
      out.push(`    from ${d.pickupAddress ?? '-'}`);
      out.push(`    to   ${d.dropoffAddress ?? '-'}`);
    }
  }

  out.push('');
  out.push('WHAT IS NOT IN THIS COPY');
  out.push('  This is the readable summary. The machine-readable copy, which you');
  out.push('  can ask for in the app, also carries your payments, store drop-offs');
  out.push('  and handover records in full.');
  return out.join('\n');
}

/**
 * buildHtmlExport lived here and is DELETED (2026-09-04).
 *
 * It was a second, worse copy of users.service.formatExportAsHtml. It read
 * bundle.user where the bundle has profile, and treated bundle.deliveries as
 * an array where it is { asCustomer, asDriver }. So every export anyone ever
 * received showed an empty profile and no deliveries, in unstyled
 * browser-default HTML, while a correct and properly styled formatter sat
 * unused in the service.
 *
 * Deleting it rather than fixing it, because two builders for one document is
 * how they drift apart in the first place.
 */

function csvEscape(s: any): string {
  const str = String(s ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildCsvDeliveries(bundle: any): string {
  const deliveries: any[] = Array.isArray(bundle?.deliveries) ? bundle.deliveries : [];
  const header = ['trackingCode', 'status', 'pickupAddress', 'dropoffAddress', 'price', 'createdAt'].join(',');
  const rows = deliveries.map((d) => [
    csvEscape(d.trackingCode),
    csvEscape(d.status),
    csvEscape(d.pickupAddress),
    csvEscape(d.dropoffAddress),
    csvEscape(Number(d.price ?? 0)),
    csvEscape(d.createdAt),
  ].join(','));
  return [header, ...rows].join('\r\n');
}
