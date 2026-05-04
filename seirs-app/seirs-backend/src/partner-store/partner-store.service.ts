import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, In, Not } from 'typeorm';
import { StoreDropoff, DropoffMode, DropoffStatus } from './store-dropoff.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { User } from '../users/user.entity';
import { FeesService } from '../fees/fees.service';
import { IdentityService } from '../identity/identity.service';
import { HandoffMethod, HandoffStage } from '../identity/handoff-record.entity';
import { MailService } from '../mail/mail.service';

// "In store" means physically present at the pickup or dropoff location —
// these statuses count against capacity, accrue storage fees, etc.
const IN_STORE_STATUSES: DropoffStatus[] = [
  DropoffStatus.RECEIVED_AT_STORE,
  DropoffStatus.AWAITING_DRIVER,
  DropoffStatus.AT_DROPOFF_STORE,
  DropoffStatus.AWAITING_COLLECTION,
];

// Crockford-style alphabet (no I L O 0 1) — same as auth-codes.ts.
// Keeps backup codes unambiguous when read aloud or printed on receipts.
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateBackupCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += BACKUP_ALPHABET[Math.floor(Math.random() * BACKUP_ALPHABET.length)];
  return s;
}

function generateDropCode(): string {
  // 12-char prefixed code printed on labels, e.g. SDR-A7K2P9X3
  return 'SDR-' + generateBackupCode() + generateBackupCode().slice(0, 2);
}

@Injectable()
export class PartnerStoreService {
  private readonly logger = new Logger(PartnerStoreService.name);

  constructor(
    @InjectRepository(StoreDropoff)  private dropoffRepo: Repository<StoreDropoff>,
    @InjectRepository(PartnerStore)  private storeRepo:   Repository<PartnerStore>,
    @InjectRepository(User)          private usersRepo:   Repository<User>,
    private readonly feesService:    FeesService,
    private readonly identityService: IdentityService,
    private readonly mailService:    MailService,
  ) {}

  // ── Sender flow ────────────────────────────────────────────────────────

  // Customer schedules a drop-off in the app. Returns the codes they
  // print/write on the package and walk into the store with.
  async scheduleDropoff(senderUserId: string, body: {
    pickupStoreId:    string;
    mode:             DropoffMode;
    dropoffStoreId?:  string;
    recipientAddress?: string;
    recipientUserId?: string;
    recipientName:    string;
    recipientPhone:   string;
    weightKg:         number;
    packageDescription?: string;
    declaredValueNgn?: number;
  }) {
    if (body.mode === DropoffMode.STORE_TO_STORE && !body.dropoffStoreId) {
      throw new BadRequestException('STORE_TO_STORE requires dropoffStoreId');
    }
    if (body.mode === DropoffMode.STORE_TO_DOOR && !body.recipientAddress) {
      throw new BadRequestException('STORE_TO_DOOR requires recipientAddress');
    }

    // Capacity preflight — refuse the booking up-front rather than letting
    // the customer walk in and get rejected at the counter.
    const cap = await this.getCapacity(body.pickupStoreId);
    if (cap.full) {
      throw new ForbiddenException(
        `Pickup store is at capacity (${cap.currentLoad}/${cap.maxCapacity}). Pick a different store.`,
      );
    }
    if (body.mode === DropoffMode.STORE_TO_STORE) {
      const dropCap = await this.getCapacity(body.dropoffStoreId!);
      if (dropCap.full) {
        throw new ForbiddenException(
          `Destination store is at capacity. Pick a different drop-off store or door delivery.`,
        );
      }
    }

    const dropoff = this.dropoffRepo.create({
      dropCode:           generateDropCode(),
      backupCode:         generateBackupCode(),
      senderUserId,
      pickupStoreId:      body.pickupStoreId,
      mode:               body.mode,
      dropoffStoreId:     body.dropoffStoreId ?? null,
      recipientAddress:   body.recipientAddress ?? null,
      recipientUserId:    body.recipientUserId ?? null,
      recipientName:      body.recipientName,
      recipientPhone:     body.recipientPhone,
      weightKg:           body.weightKg,
      packageDescription: body.packageDescription ?? null,
      declaredValueNgn:   body.declaredValueNgn ?? 0,
      status:             DropoffStatus.SCHEDULED,
    });
    return this.dropoffRepo.save(dropoff);
  }

  // Partner staff scans the QR (or types the backup code) and confirms
  // the package details + photo + sender identity. After this, the
  // package is officially in their custody.
  async receiveAtStore(staffUserId: string, body: {
    code:             string;       // either dropCode or backupCode
    weightKg:         number;       // partner's actual weight measurement
    receivedPhotoUrl: string;       // proof photo of package on partner counter
    senderOtp:        string;       // sender shows OTP from email
  }) {
    const dropoff = await this.findByCode(body.code);
    if (dropoff.status !== DropoffStatus.SCHEDULED) {
      throw new BadRequestException(`Cannot receive — current status is ${dropoff.status}`);
    }

    // Validate the staff actually works at this store
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== dropoff.pickupStoreId) {
      throw new ForbiddenException('You are not registered as staff for the pickup store');
    }

    // Verify sender via identity module — uses the same OTP path drivers
    // use to verify recipients. Stage = CUSTOMER_TO_STORE (sender → store).
    await this.identityService.verifyHandoff({
      deliveryId: dropoff.id, // we use dropoff id as the delivery id for handoff records pre-driver
      stage:      HandoffStage.CUSTOMER_TO_STORE,
      method:     HandoffMethod.PHYSICAL_ID,
      fromUserId: dropoff.senderUserId,
      idType:     'sender_otp',
      idNumber:   dropoff.senderUserId, // last-4 will store last-4 of user UUID — adequate for audit
      otp:        body.senderOtp,
      proofPhotoUrl: body.receivedPhotoUrl,
    } as any);

    await this.dropoffRepo.update(dropoff.id, {
      status:           DropoffStatus.RECEIVED_AT_STORE,
      weightKg:         body.weightKg,
      receivedAtStoreAt: new Date(),
      receivedPhotoUrl:  body.receivedPhotoUrl,
    });

    // Move forward into the dispatch queue
    await this.dropoffRepo.update(dropoff.id, { status: DropoffStatus.AWAITING_DRIVER });
    return this.findById(dropoff.id);
  }

  // ── Recipient flow ─────────────────────────────────────────────────────

  // Partner staff at the dropoff store releases package to recipient
  // after identity verification. Two paths supported (physical ID + OTP,
  // or SEIRS ID + typed name) — same as Spec V8 §1.17.
  async releaseToRecipient(staffUserId: string, body: {
    code:               string;
    method:             HandoffMethod;
    collectedPhotoUrl:  string;
    // Physical ID args
    idType?:            string;
    idNumber?:          string;
    otp?:               string;
    idPhotoUrl?:        string;
    // SEIRS ID args
    seirsCode?:         string;
    typedName?:         string;
  }) {
    const dropoff = await this.findByCode(body.code);
    if (![DropoffStatus.AT_DROPOFF_STORE, DropoffStatus.AWAITING_COLLECTION].includes(dropoff.status)) {
      throw new BadRequestException(`Cannot release — current status is ${dropoff.status}`);
    }

    const releaseStoreId = dropoff.dropoffStoreId ?? dropoff.pickupStoreId;
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== releaseStoreId) {
      throw new ForbiddenException('You are not registered as staff for the release store');
    }

    if (!dropoff.recipientUserId) {
      throw new BadRequestException(
        'Recipient is unknown — only registered SEIRS users can collect via this flow',
      );
    }

    await this.identityService.verifyHandoff({
      deliveryId:  dropoff.deliveryId ?? dropoff.id,
      stage:       HandoffStage.STORE_TO_RECIPIENT,
      method:      body.method,
      fromUserId:  staffUserId,
      idType:      body.idType,
      idNumber:    body.idNumber,
      otp:         body.otp,
      idPhotoUrl:  body.idPhotoUrl,
      seirsCode:   body.seirsCode,
      typedName:   body.typedName,
      proofPhotoUrl: body.collectedPhotoUrl,
    } as any);

    await this.dropoffRepo.update(dropoff.id, {
      status:           DropoffStatus.COLLECTED,
      collectedAt:      new Date(),
      collectedPhotoUrl: body.collectedPhotoUrl,
    });
    return this.findById(dropoff.id);
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async findById(id: string) {
    const row = await this.dropoffRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Drop-off not found');
    return row;
  }

  // Accepts either the printed dropCode (SDR-XXXXXXXX) or the 6-char
  // backup code typed by hand. Server treats them identically.
  async findByCode(code: string) {
    const c = code.trim().toUpperCase();
    let row: StoreDropoff | null = null;
    if (c.startsWith('SDR-')) {
      row = await this.dropoffRepo.findOne({ where: { dropCode: c } });
    } else {
      row = await this.dropoffRepo.findOne({ where: { backupCode: c } });
    }
    if (!row) throw new NotFoundException('Drop-off not found');
    return row;
  }

  async listForSender(senderUserId: string) {
    return this.dropoffRepo.find({
      where: { senderUserId },
      order: { createdAt: 'DESC' },
      take:  100,
    });
  }

  async listForStore(partnerStoreId: string, opts?: { onlyActive?: boolean }) {
    const where: any = [
      { pickupStoreId: partnerStoreId },
      { dropoffStoreId: partnerStoreId },
    ];
    if (opts?.onlyActive) {
      // both sides need the active filter applied
      where[0] = { ...where[0], status: In(IN_STORE_STATUSES) };
      where[1] = { ...where[1], status: In(IN_STORE_STATUSES) };
    }
    return this.dropoffRepo.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  // ── Capacity ───────────────────────────────────────────────────────────

  // Real-time capacity computation. Anything physically in the store
  // counts against maxCapacity. Returned as a bucketed string for the
  // customer-facing UI per Spec V8 (Plenty / Limited / Full) and as
  // exact numbers for the partner's own dashboard.
  async getCapacity(partnerStoreId: string) {
    const store = await this.storeRepo.findOne({ where: { id: partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found');

    const inStore = await this.dropoffRepo.count({
      where: [
        { pickupStoreId:  partnerStoreId, status: In(IN_STORE_STATUSES) },
        { dropoffStoreId: partnerStoreId, status: In(IN_STORE_STATUSES) },
      ],
    });

    const max  = store.maxCapacity;
    const pct  = max > 0 ? inStore / max : 0;
    const bucket = pct >= 1 ? 'full' : pct >= 0.85 ? 'limited' : 'plenty';
    return {
      partnerStoreId,
      currentLoad: inStore,
      maxCapacity: max,
      percent:     Math.round(pct * 100),
      bucket,                                  // for customer-facing UI
      full:        bucket === 'full',
    };
  }

  async listCapacityNearby(_lat?: number, _lng?: number, _radiusKm = 10) {
    // Stub for the customer "pick a store" screen — returns all active
    // stores with their capacity. Geofiltering by haversine moves to
    // a follow-up commit when we wire the customer UI.
    const stores = await this.storeRepo.find({ where: { status: 'active' } });
    return Promise.all(
      stores.map(async s => ({
        id:           s.id,
        storeName:    s.storeName,
        storeAddress: s.storeAddress,
        ...(await this.getCapacity(s.id)),
      })),
    );
  }

  // ── Partner store status (accept-incoming toggle) ──────────────────────

  // Lets a partner pause incoming bookings without going fully offline.
  // The customer-facing capacity browser filters out paused stores.
  async setStoreStatus(storeId: string, status: 'active' | 'paused', staffUserId: string) {
    const staff = await this.usersRepo.findOne({ where: { id: staffUserId } });
    if (!staff || staff.partnerStoreId !== storeId) {
      throw new ForbiddenException('You are not registered as staff for this store');
    }
    if (!['active', 'paused'].includes(status)) {
      throw new BadRequestException('status must be "active" or "paused"');
    }
    await this.storeRepo.update(storeId, { status });
    return { storeId, status };
  }

  // ── Storage overstay listing ───────────────────────────────────────────

  // Lists packages currently in this store that have crossed the 24hr free
  // window, with hours-overdue and accrued fees computed live. Powers
  // biz.partStorage. Sorted oldest-arrival first so the most urgent
  // are at the top.
  async listOverstays(partnerStoreId: string) {
    const all = await this.dropoffRepo.find({
      where: [
        { pickupStoreId:  partnerStoreId, status: In(IN_STORE_STATUSES) },
        { dropoffStoreId: partnerStoreId, status: In(IN_STORE_STATUSES) },
      ],
    });
    const now = Date.now();
    return all
      .map(d => {
        const arrivedAt = d.arrivedAtDropoffStoreAt ?? d.receivedAtStoreAt;
        const hoursInStore = arrivedAt
          ? (now - new Date(arrivedAt).getTime()) / 3600_000
          : 0;
        return {
          id:                    d.id,
          dropCode:              d.dropCode,
          recipientName:         d.recipientName,
          recipientPhone:        d.recipientPhone,
          weightKg:              Number(d.weightKg),
          status:                d.status,
          arrivedAt:             arrivedAt?.toISOString() ?? null,
          hoursInStore:          Math.round(hoursInStore * 10) / 10,
          storageFeesAccruedNgn: Number(d.storageFeesAccruedNgn),
          tier:
            hoursInStore < 24 ? 'free' :
            hoursInStore < 48 ? 'tier_1' :          // 24-48hr
            hoursInStore < 72 ? 'tier_2' :          // 48-72hr
                                'return_eligible',  // ≥72hr
        };
      })
      .filter(d => d.hoursInStore >= 24) // only overstays
      .sort((a, b) => b.hoursInStore - a.hoursInStore);
  }

  // ── Storage fee accrual ────────────────────────────────────────────────

  // Daily cron — at 00:05 every day, walk every active in-store dropoff
  // older than 24 hours and accrue the daily storage fee per Spec V8.
  // After 72 hours triggers the return-to-sender path.
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async accrueStorageFees() {
    const dailyFee   = await this.feesService.getValueOr('storage_24_72hr', 200);
    const returnFee  = await this.feesService.getValueOr('storage_return_fee', 500);

    const inStore = await this.dropoffRepo.find({
      where: [
        { status: DropoffStatus.AWAITING_DRIVER },
        { status: DropoffStatus.AT_DROPOFF_STORE },
        { status: DropoffStatus.AWAITING_COLLECTION },
      ],
    });

    let charged = 0;
    let returned = 0;
    for (const d of inStore) {
      const arrivedAt = d.arrivedAtDropoffStoreAt ?? d.receivedAtStoreAt;
      if (!arrivedAt) continue;
      const hoursInStore = (Date.now() - new Date(arrivedAt).getTime()) / 3600_000;

      if (hoursInStore >= 24 && hoursInStore < 72) {
        await this.dropoffRepo.update(d.id, {
          storageFeesAccruedNgn: Number(d.storageFeesAccruedNgn) + dailyFee,
        });
        charged++;
      } else if (hoursInStore >= 72 && d.status !== DropoffStatus.RETURN_TRIGGERED) {
        await this.dropoffRepo.update(d.id, {
          status: DropoffStatus.RETURN_TRIGGERED,
          storageFeesAccruedNgn: Number(d.storageFeesAccruedNgn) + returnFee,
        });
        returned++;
      }
    }
    if (charged || returned) {
      this.logger.log(`Storage fee accrual: charged=${charged} return-triggered=${returned}`);
    }
  }
}
