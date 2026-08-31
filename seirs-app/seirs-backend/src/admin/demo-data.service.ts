import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../users/user.entity';
import { Driver, DriverStatus, VehicleType } from '../drivers/driver.entity';
import { BusinessAccount, BusinessAccountStatus } from '../business/business-account.entity';
import { PartnerStore, PartnerStoreStatus } from '../business/partner-store.entity';
import { Delivery, DeliveryStatus, PackageSize, UrgencyLevel, DeliverySource } from '../deliveries/delivery.entity';
import { DriverEarning } from '../earnings/driver-earning.entity';
import { Wallet } from '../payments/wallet.entity';
import { StoreDropoff, DropoffMode, DropoffStatus } from '../partner-store/store-dropoff.entity';
import { LoyaltyPoint } from '../loyalty/loyalty-point.entity';
import { AccountIdPrefix, generateAccountId, secureCode } from '../common/utils/auth-codes';
import { PLATFORM_COMMISSION } from '../common/constants/pricing';

/**
 * Demo/marketing accounts (founder 2026-08-11): screenshots and any
 * future product demos must NEVER show a real user's name, SEIRS ID,
 * or activity. This service stages three fully-populated, permanently
 * fake accounts - one per Nigeria's three major ethnic groups, per the
 * standing sample-data rule - so there is always a safe account to sign
 * into for marketing captures.
 *
 * Idempotent: safe to call repeatedly. Re-running refreshes the display
 * fields and password (so the founder can always log back in with the
 * same fixed credentials) without duplicating deliveries or ledger rows
 * once the base activity exists.
 *
 * Deliberately NOT run on boot: seeding fake accounts automatically in
 * every environment (including a fresh prod DB) is the kind of thing
 * that should be a conscious admin action, not a silent side effect.
 * Triggered only via POST /admin/demo-data/seed (admin-dashboard button).
 */

// No hardcoded credential (2026-08-12 security review): a fixed
// password committed to source is a standing backdoor into three live,
// APPROVED accounts. A fresh one is generated per seed and returned
// ONCE in the API response for the admin to copy. Re-seeding rotates it.
function generateDemoPassword(): string {
  return `Demo-${secureCode(5)}-${secureCode(5)}!`;
}

const LAGOS = { lat: 6.5244, lng: 3.3792 };     // Lagos Island reference
const IKEJA = { lat: 6.6018, lng: 3.3515 };     // driver's home base

@Injectable()
export class DemoDataService {
  private readonly logger = new Logger(DemoDataService.name);

  constructor(
    @InjectRepository(User)           private usersRepo:    Repository<User>,
    @InjectRepository(Driver)         private driversRepo:  Repository<Driver>,
    @InjectRepository(BusinessAccount) private bizRepo:      Repository<BusinessAccount>,
    @InjectRepository(PartnerStore)   private storeRepo:    Repository<PartnerStore>,
    @InjectRepository(Delivery)       private deliveryRepo: Repository<Delivery>,
    @InjectRepository(DriverEarning)  private earningRepo:  Repository<DriverEarning>,
    @InjectRepository(Wallet)         private walletRepo:   Repository<Wallet>,
    @InjectRepository(StoreDropoff)   private dropoffRepo:  Repository<StoreDropoff>,
    @InjectRepository(LoyaltyPoint)   private loyaltyRepo:  Repository<LoyaltyPoint>,
  ) {}

  async seedDemoAccounts() {
    const password = generateDemoPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    // Names approved by the founder 2026-08-12, one per major ethnic
    // group per the standing sample-data rule: Yoruba female customer,
    // Igbo male driver, Hausa-owned business. Nothing religious.
    const customer = await this.upsertUser({
      email: 'demo.customer@seirs.co', firstName: 'Folasade', lastName: 'Adeyemi',
      phone: '08031234567', role: UserRole.CUSTOMER, passwordHash,
      homeAddress: {
        label: 'Home', street: '15 Admiralty Way', city: 'Lekki', state: 'Lagos',
        coords: { lat: 6.4419, lng: 3.4720 },
      },
    });

    const driverUser = await this.upsertUser({
      email: 'demo.driver@seirs.co', firstName: 'Emeka', lastName: 'Nwachukwu',
      phone: '08091234568', role: UserRole.DRIVER, passwordHash,
      identityVerified: true, identityDocType: 'nin',
      bank: { bankCode: '058', bankAccountNumber: '0123456789', bankAccountName: 'EMEKA NWACHUKWU' },
    });

    // Business accounts carry the BIZ- prefix, exactly like a real
    // signup through the business app. Partner is a CAPABILITY on the
    // same account, so the SEIRS ID never mutates when they are approved
    // to hold packages (it is printed on receipts and package labels).
    const storeOwner = await this.upsertUser({
      email: 'demo.store@seirs.co', firstName: 'Yusuf', lastName: 'Garba',
      phone: '08071234569', role: UserRole.CUSTOMER, passwordHash,
      accountIdPrefix: AccountIdPrefix.BUSINESS,
      businessRole: 'owner',
      homeAddress: {
        label: 'Shop', street: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos',
        coords: { lat: IKEJA.lat, lng: IKEJA.lng },
      },
    });

    const driver = await this.upsertDriver(driverUser);
    await this.upsertWallet(driverUser.id, 184_500_00); // 184,500 NGN in kobo

    const business = await this.upsertBusinessAccount(storeOwner);
    await this.upsertPartnerStore(storeOwner, business);

    const deliveries = await this.ensureDemoDeliveries(customer, driver);

    await this.ensureDemoDropoffs(customer, business);

    await this.ensureDemoLoyalty(customer);

    this.logger.log('Demo accounts seeded/refreshed (password rotated)');
    return {
      password,
      accounts: {
        customer: { email: customer.email, name: customer.name, accountId: customer.accountId },
        driver:   { email: driverUser.email, name: driverUser.name, accountId: driverUser.accountId },
        business: { email: storeOwner.email, name: storeOwner.name, accountId: storeOwner.accountId },
      },
      demoDeliveriesCreated: deliveries,
    };
  }

  /**
   * A whole cast for end-to-end scenario testing: 10 customers, 5 riders,
   * 5 businesses of which 3 hold packages as partner stores.
   *
   * Why this exists rather than registering them through the app: the
   * signup OTP is bcrypt-hashed the moment it is generated, so nobody,
   * including an admin with full database access, can read a code back
   * out and hand it to a tester. These accounts are never emailed, so
   * emailVerified is simply true: there is no verification to skip when
   * no message was ever sent.
   *
   * Everything created here carries isDemo, which every money and
   * dispatch guard already checks, so a scenario account cannot take real
   * money, be dispatched a real job, or be paid out.
   *
   * Idempotent: re-running rotates the password and refreshes the cast
   * rather than duplicating it.
   */
  async seedScenarioCohort() {
    const password     = generateDemoPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const CUSTOMERS = [
      ['Chiamaka', 'Okonkwo', '08030000101'], ['Bolanle',  'Adeyemi',  '08030000102'],
      ['Ibrahim',  'Suleiman','08030000103'], ['Ngozi',    'Eze',      '08030000104'],
      ['Tunde',    'Bakare',  '08030000105'], ['Halima',   'Yusuf',    '08030000106'],
      ['Emeka',    'Obi',     '08030000107'], ['Folasade', 'Ogunleye', '08030000108'],
      ['Musa',     'Danjuma', '08030000109'], ['Adaeze',   'Nwosu',    '08030000110'],
    ] as const;

    const DRIVERS = [
      ['Segun',   'Afolabi',  '08090000201'], ['Chidi',   'Anyanwu', '08090000202'],
      ['Aliyu',   'Mohammed', '08090000203'], ['Kunle',   'Oyelaran','08090000204'],
      ['Obinna',  'Chukwu',   '08090000205'],
    ] as const;

    // The first three also hold packages as partner stores. Partner is a
    // CAPABILITY on a business account, not a separate account, so the
    // SEIRS ID never mutates when they are approved: it is printed on
    // receipts and package labels.
    const BUSINESSES = [
      ['Amaka',   'Ilochi',   '08070000301', true ], ['Sadiq',  'Bello',   '08070000302', true ],
      ['Yewande', 'Coker',    '08070000303', true ], ['Ifeanyi','Madu',    '08070000304', false],
      ['Zainab',  'Abdullahi','08070000305', false],
    ] as const;

    const customers: any[] = [];
    for (const [first, last, phone] of CUSTOMERS) {
      customers.push(await this.upsertUser({
        email: `scn.cust.${first.toLowerCase()}@seirs.co`,
        firstName: first, lastName: last, phone,
        role: UserRole.CUSTOMER, passwordHash,
      }));
    }

    const drivers: any[] = [];
    for (const [first, last, phone] of DRIVERS) {
      const u = await this.upsertUser({
        email: `scn.drv.${first.toLowerCase()}@seirs.co`,
        firstName: first, lastName: last, phone,
        role: UserRole.DRIVER, passwordHash,
      });
      drivers.push({ user: u, driver: await this.upsertDriver(u) });
    }

    const businesses: any[] = [];
    for (const [first, last, phone, isPartner] of BUSINESSES) {
      const owner = await this.upsertUser({
        email: `scn.biz.${first.toLowerCase()}@seirs.co`,
        firstName: first, lastName: last, phone,
        role: UserRole.CUSTOMER, passwordHash,
        accountIdPrefix: AccountIdPrefix.BUSINESS,
        businessRole: 'owner',
      });
      const biz = await this.upsertBusinessAccount(owner);
      const store = isPartner ? await this.upsertPartnerStore(owner, biz) : null;
      businesses.push({ owner, biz, store, isPartner });
    }

    this.logger.warn(
      `Scenario cohort seeded: ${customers.length} customers, ${drivers.length} drivers, ` +
      `${businesses.length} businesses (${businesses.filter(b => b.isPartner).length} partner stores). ` +
      `Password rotated.`,
    );

    return {
      password,
      note: 'One password for the whole cohort. It rotates on every seed and is returned once. Every account is isDemo and cannot touch real money.',
      customers: customers.map(u => ({ email: u.email, name: u.name, seirsId: u.accountId })),
      drivers:   drivers.map(d => ({ email: d.user.email, name: d.user.name, seirsId: d.user.accountId, driverId: d.driver?.id ?? null })),
      businesses: businesses.map(b => ({
        email: b.owner.email, name: b.owner.name, seirsId: b.owner.accountId,
        businessId: b.biz?.id ?? null, partnerStoreId: b.store?.id ?? null, isPartner: b.isPartner,
      })),
    };
  }

  // ── Users ────────────────────────────────────────────────────────────────

  private async upsertUser(opts: {
    email: string; firstName: string; lastName: string; phone: string;
    role: UserRole; passwordHash: string;
    /** Overrides the role-derived prefix (business accounts are BIZ-). */
    accountIdPrefix?: string;
    /** businessLogin() gates on this: without it the demo store owner can
     *  never sign in to the business app (found 2026-08-15, on-device). */
    businessRole?: string;
    homeAddress?: User['homeAddress'];
    identityVerified?: boolean; identityDocType?: string;
    bank?: { bankCode: string; bankAccountNumber: string; bankAccountName: string };
  }): Promise<User> {
    const name = `${opts.firstName} ${opts.lastName}`;
    let user = await this.usersRepo.findOne({ where: { email: opts.email } });

    const patch: Partial<User> = {
      name, firstName: opts.firstName, lastName: opts.lastName,
      phone: opts.phone, role: opts.role, password: opts.passwordHash,
      emailVerified: true, isActive: true,
      // The flag every money/dispatch guard checks.
      isDemo: true,
      homeAddress: opts.homeAddress ?? null,
      identityVerifiedAt: opts.identityVerified ? new Date() : null,
      identityDocType: opts.identityDocType ?? null,
      ...(opts.businessRole ? { businessRole: opts.businessRole } : {}),
      ...(opts.bank ?? {}),
    };

    if (!user) {
      const prefix = opts.accountIdPrefix
        ?? (opts.role === UserRole.DRIVER ? AccountIdPrefix.DRIVER : AccountIdPrefix.CUSTOMER);
      const accountId = await this.uniqueAccountId(prefix);
      user = this.usersRepo.create({ email: opts.email, accountId, ...patch });
    } else if (user.isDemo) {
      // The seed created this row and owns it: rewriting is the point,
      // including the password, which is how a fresh demo login is issued.
      Object.assign(user, patch);
    } else {
      /**
       * A REAL account wearing a demo email. Fill blanks, change nothing.
       *
       * This branch used to be a plain Object.assign, and the patch carries
       * ...(opts.bank ?? {}), so re-seeding replaced a real person's payout
       * destination with the demo GTBank account. It happened to the
       * founder's test bank account on 2026-08-31 and left no audit row,
       * because seeding is not an edit as far as the audit log knows.
       *
       * Bank details, identity and the password are never filled in here
       * even when blank: a payout destination is not something a demo
       * fixture gets to decide.
       */
      const NEVER = new Set([
        'bankCode', 'bankName', 'bankAccountNumber', 'bankAccountName',
        'password', 'identityVerifiedAt', 'identityDocType', 'isDemo',
      ]);
      for (const [key, value] of Object.entries(patch)) {
        if (NEVER.has(key)) continue;
        const current = (user as any)[key];
        if (current === null || current === undefined) {
          (user as any)[key] = value;
        }
      }
    }
    return this.usersRepo.save(user);
  }

  private async uniqueAccountId(prefix: string): Promise<string> {
    let id = generateAccountId(prefix as any);
    for (let i = 0; i < 5; i++) {
      const exists = await this.usersRepo.exist({ where: { accountId: id } });
      if (!exists) return id;
      id = generateAccountId(prefix as any);
    }
    return id;
  }

  // ── Driver profile + wallet ─────────────────────────────────────────────

  private async upsertDriver(user: User): Promise<Driver> {
    let driver = await this.driversRepo.findOne({ where: { user: { id: user.id } } });
    const patch: Partial<Driver> = {
      vehicleType: VehicleType.MOTORCYCLE,
      vehiclePlate: 'LND-482-KJ',
      vehicleDetails: { make: 'Bajaj', model: 'Boxer', year: '2023', color: 'Red' },
      status: DriverStatus.APPROVED,
      isOnline: true,
      /**
       * rating and totalDeliveries are deliberately NOT seeded.
       *
       * They used to be written as 4.87 and 214, which is a driver who has
       * completed seven trips being credited with two hundred and fourteen.
       * Those columns are not decoration: matching.service.ts scores
       * drivers on the stored rating, so a seeded figure takes real jobs
       * from real drivers, and deliveries.service.ts surfaces both to
       * customers. A reputation is earned or it is a lie.
       */
      lastLat: IKEJA.lat,
      lastLng: IKEJA.lng,
      locationUpdatedAt: new Date(),
    };
    if (!driver) {
      driver = this.driversRepo.create({ user, ...patch });
    } else {
      /**
       * Fill blanks only. NEVER overwrite.
       *
       * This was Object.assign(driver, patch), so re-running the seed
       * rewrote a real driver's vehicle, plate, location and reputation,
       * with no audit row anywhere because seeding is not an edit. The
       * founder lost a test bank account this way and spent an afternoon
       * distrusting numbers that were, correctly, not to be trusted.
       */
      for (const [key, value] of Object.entries(patch)) {
        const current = (driver as any)[key];
        if (current === null || current === undefined) {
          (driver as any)[key] = value;
        }
      }
    }
    return this.driversRepo.save(driver);
  }

  private async upsertWallet(userId: string, balanceKobo: number) {
    let wallet = await this.walletRepo.findOne({ where: { user: { id: userId } } });
    if (!wallet) {
      wallet = this.walletRepo.create({
        user: { id: userId } as User, balanceKobo,
        bankName: 'GTBank', bankCode: '058',
        bankAccountNumber: '0123456789', bankAccountName: 'EMEKA NWACHUKWU',
      });
    } else {
      wallet.balanceKobo = balanceKobo;
    }
    return this.walletRepo.save(wallet);
  }

  // ── Business + partner store ────────────────────────────────────────────

  private async upsertBusinessAccount(owner: User): Promise<BusinessAccount> {
    let biz = await this.bizRepo.findOne({ where: { ownerId: owner.id } });
    const patch: Partial<BusinessAccount> = {
      companyName: 'Kano Fabrics & More',
      businessAddress: '12 Allen Avenue, Ikeja, Lagos',
      state: 'Lagos', city: 'Ikeja', streetAddress: '12 Allen Avenue',
      status: BusinessAccountStatus.ACTIVE,
      walletBalance: 62_000,
      loyaltyPoints: 340,
      ownerId: owner.id,
    };
    if (!biz) {
      biz = this.bizRepo.create(patch);
    } else {
      Object.assign(biz, patch);
    }
    biz = await this.bizRepo.save(biz);

    if (owner.businessAccountId !== biz.id || !owner.capabilities?.canPartner) {
      owner.businessAccountId = biz.id;
      owner.capabilities = { canSend: true, canPartner: true };
      await this.usersRepo.save(owner);
    }
    return biz;
  }

  private async upsertPartnerStore(owner: User, biz: BusinessAccount): Promise<PartnerStore> {
    let store = await this.storeRepo.findOne({ where: { userId: owner.id } });
    const patch: Partial<PartnerStore> = {
      userId: owner.id,
      storeName: biz.companyName,
      storeAddress: biz.businessAddress,
      storeLat: String(IKEJA.lat), storeLng: String(IKEJA.lng),
      phone: owner.phone,
      maxCapacity: 50,
      status: PartnerStoreStatus.APPROVED,
      acceptingNew: true,
      reviewedAt: new Date(),
    };
    if (!store) {
      store = this.storeRepo.create(patch);
    } else {
      Object.assign(store, patch);
    }
    /**
     * An approved store must carry its public code: the partner dashboard
     * shows "Code pending approval" without one, so a demo store that is
     * live and taking drop-offs still looked unapproved to its owner
     * (found on device 2026-08-16). The PartnerStore module backfills
     * codes at boot, but that runs BEFORE this seeder creates the row, so
     * a seeded store never received one.
     */
    if (!store.storeCode) {
      store.storeCode = `PART-${secureCode(4)}`;
    }
    const saved = await this.storeRepo.save(store);

    /**
     * The link has to point BOTH ways. The store carried userId, but the
     * user's partnerStoreId was never set, and every partner endpoint
     * resolves the store through user.partnerStoreId. The whole partner
     * side therefore answered 403 "Partner store not found": empty store
     * settings, zero earnings, zero capacity and a dashboard reading
     * "Code pending approval" for a counter that was live and listed in
     * customer searches (found 2026-08-17).
     */
    if (owner.partnerStoreId !== saved.id) {
      await this.usersRepo.update(owner.id, { partnerStoreId: saved.id });
    }
    return saved;
  }

  // ── Delivery history + earnings ledger ──────────────────────────────────

  private async ensureDemoDeliveries(customer: User, driver: Driver): Promise<number> {
    const existing = await this.deliveryRepo.count({
      where: { customer: { id: customer.id }, driver: { id: driver.id } },
    });
    if (existing > 0) return 0;

    const drops = [
      { addr: '4 Bourdillon Road, Ikoyi, Lagos',        lat: 6.4522, lng: 3.4335, desc: 'Documents', size: PackageSize.SMALL,  price: 1450, daysAgo: 21, rating: 5 },
      { addr: '23 Awolowo Road, Ikoyi, Lagos',           lat: 6.4550, lng: 3.4290, desc: 'Small parcel',  size: PackageSize.SMALL,  price: 1800, daysAgo: 17, rating: 5 },
      { addr: '9 Adeola Odeku, Victoria Island, Lagos',  lat: 6.4281, lng: 3.4219, desc: 'Fragile / Electronics', size: PackageSize.MEDIUM, price: 2600, daysAgo: 12, rating: 4 },
      { addr: '55 Opebi Road, Ikeja, Lagos',             lat: 6.5977, lng: 3.3592, desc: 'Standard parcel', size: PackageSize.MEDIUM, price: 2100, daysAgo: 8,  rating: 5 },
      { addr: '18 Toyin Street, Ikeja, Lagos',           lat: 6.5980, lng: 3.3450, desc: 'Documents', size: PackageSize.SMALL,  price: 1350, daysAgo: 4,  rating: 5 },
      { addr: '2 Ligali Ayorinde, Victoria Island, Lagos', lat: 6.4265, lng: 3.4245, desc: 'Bulk goods', size: PackageSize.LARGE, price: 3400, daysAgo: 1,  rating: 4 },
    ];

    let created = 0;
    for (const d of drops) {
      const trackingCode = await this.uniqueTrackingCode();
      const deliveredAt = new Date(Date.now() - d.daysAgo * 24 * 60 * 60 * 1000);
      const driverEarnings = +(d.price * (1 - PLATFORM_COMMISSION)).toFixed(2);

      /**
       * A believable run, backwards from when it landed.
       *
       * Every demo delivery used to stamp assignedAt, pickedUpAt and
       * deliveredAt with the SAME instant, and let createdAt default to
       * now, so a run seeded today but dated a week ago was booked after
       * it was delivered. Nothing displayed that until the tracking
       * screen started showing a time against each step, at which point
       * the timeline read "Booked 12 Aug, Delivered 11 Aug" and every
       * step claimed the same minute (device QA 2026-08-19).
       *
       * Longer drops take longer: the offsets scale with the distance
       * band the drop already carries in its price.
       */
      const mins  = (n: number) => new Date(deliveredAt.getTime() - n * 60 * 1000);
      const haul  = Math.round(d.price / 90);          // ~15-38 min of riding
      const bookedAtDate = mins(haul + 26);
      const assignedAt   = mins(haul + 19);
      const pickedUpAt   = mins(haul);

      // TypeORM's create() resolves to the ARRAY overload when the
      // literal is cast `as any` (documented gotcha: TS2339 'id' does
      // not exist on Delivery[]). Cast the awaited result, not the input.
      const delivery = (await this.deliveryRepo.save(this.deliveryRepo.create({
        trackingCode,
        customer,
        driver,
        pickupAddress: '15 Admiralty Way, Lekki, Lagos',
        pickupLat: 6.4419, pickupLng: 3.4720,
        dropoffAddress: d.addr, dropoffLat: d.lat, dropoffLng: d.lng,
        packageDescription: d.desc, packageSize: d.size,
        urgency: UrgencyLevel.STANDARD, vehicleType: 'motorcycle',
        price: d.price, driverEarnings, distanceKm: 8 + Math.random() * 10,
        status: DeliveryStatus.DELIVERED, source: DeliverySource.CUSTOMER_APP,
        createdAt: bookedAtDate,
        assignedAt, pickedUpAt, deliveredAt,
        actualStartedAt: pickedUpAt, actualCompletedAt: deliveredAt,
        customerRating: d.rating,
        customerComment: d.rating === 5 ? 'Fast and professional, thank you!' : 'Good service, arrived a bit later than hoped.',
      } as any))) as unknown as Delivery;

      const seirsCut = +(d.price * PLATFORM_COMMISSION).toFixed(2);
      const paid = d.daysAgo > 3;
      await this.earningRepo.save(this.earningRepo.create({
        driver: driver.user, driverId: driver.user.id,
        delivery, deliveryId: delivery.id,
        grossAmount: String(d.price), seirsCut: String(seirsCut), driverNet: String(driverEarnings),
        status: paid ? 'paid' : 'available',
        availableAt: deliveredAt,
        paidAt: paid ? new Date(deliveredAt.getTime() + 2 * 24 * 60 * 60 * 1000) : null,
        flutterwaveTransferId: paid ? `demo-${secureCode(10)}` : null,
      }));
      created++;
    }
    return created;
  }

  private async uniqueTrackingCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const candidate = 'SRS-' + secureCode(8);
      const exists = await this.deliveryRepo.exist({ where: { trackingCode: candidate } });
      if (!exists) return candidate;
    }
    return 'SRS-' + secureCode(8);
  }

  // ── Store drop-offs (capacity dashboard realism) ────────────────────────
  // Terminal-ish statuses only (RECEIVED_AT_STORE / AWAITING_COLLECTION):
  // never AWAITING_DRIVER, which would make a real driver see a fake job.

  /**
   * Loyalty ledger for the demo customer. Without this the home screen
   * reads "0 pts" next to six completed deliveries, which is both a bad
   * screenshot and an inconsistent story (founder spotted it 2026-08-12).
   *
   * Written as real ledger rows rather than a balance override, so the
   * points behave exactly like earned ones everywhere they surface:
   * history list, tier calculation, redemption. Deliberately kept in
   * Bronze range: the tier pill only shows above Bronze, and a demo
   * account flashing Platinum would misrepresent what a new customer
   * can expect.
   */
  private async ensureDemoLoyalty(customer: User) {
    const existing = await this.loyaltyRepo.count({ where: { userId: customer.id } });
    if (existing > 0) return;

    const now = new Date();
    const expiresAt = new Date(now.getTime());
    expiresAt.setMonth(expiresAt.getMonth() + 24);

    const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

    const rows = [
      { delta: 45, reason: 'delivery_complete' as const, note: 'Lekki to Victoria Island',  at: daysAgo(31) },
      { delta: 60, reason: 'delivery_complete' as const, note: 'Lekki to Ikeja',            at: daysAgo(24) },
      { delta: 10, reason: 'rate_driver' as const,       note: 'Rated a driver',            at: daysAgo(24) },
      { delta: 55, reason: 'delivery_complete' as const, note: 'Lekki to Surulere',         at: daysAgo(17) },
      { delta: 40, reason: 'delivery_complete' as const, note: 'Lekki to Yaba',             at: daysAgo(9)  },
      { delta: 10, reason: 'rate_driver' as const,       note: 'Rated a driver',            at: daysAgo(9)  },
      { delta: 65, reason: 'delivery_complete' as const, note: 'Lekki to Ajah',             at: daysAgo(4)  },
      { delta: 50, reason: 'delivery_complete' as const, note: 'Lekki to Lekki Phase 1',    at: daysAgo(1)  },
    ];

    for (const r of rows) {
      const entry = this.loyaltyRepo.create({
        userId:    customer.id,
        delta:     r.delta,
        reason:    r.reason,
        note:      r.note,
        expiresAt,
        createdAt: r.at,
      } as any);
      await this.loyaltyRepo.save(entry);
    }
  }

  private async ensureDemoDropoffs(customer: User, business: BusinessAccount) {
    const store = await this.storeRepo.findOne({ where: { userId: business.ownerId } });
    if (!store) return;
    const existing = await this.dropoffRepo.count({ where: { pickupStoreId: store.id } });
    if (existing > 0) return;

    const rows = [
      { status: DropoffStatus.RECEIVED_AT_STORE, desc: 'Shoes, size 42', value: 25000 },
      { status: DropoffStatus.AWAITING_COLLECTION, desc: 'Phone accessories', value: 8500 },
    ];
    for (const r of rows) {
      await this.dropoffRepo.save(this.dropoffRepo.create({
        dropCode: 'SDR-' + secureCode(8),
        backupCode: secureCode(6),
        senderUserId: customer.id,
        pickupStoreId: store.id,
        mode: DropoffMode.STORE_TO_DOOR,
        recipientAddress: '18 Toyin Street, Ikeja, Lagos',
        recipientName: 'Chinedu Obi',
        weightKg: 1.5,
        packageDescription: r.desc,
        declaredValueNgn: r.value,
        status: r.status,
        prePaidAmountNgn: 1500,
        receivedAtStoreAt: new Date(),
      } as any));
    }
  }
}
