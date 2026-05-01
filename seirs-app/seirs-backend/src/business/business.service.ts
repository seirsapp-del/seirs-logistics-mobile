import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../users/user.entity';
import { BusinessAccount, BusinessTeamMember } from './business-account.entity';
import { PartnerStore } from './partner-store.entity';
import { BusinessPackage, PackageStatus } from './business-package.entity';
import { BusinessWalletTx } from './business-wallet-tx.entity';
import { PartnerPayout } from './partner-payout.entity';
import { MailService } from '../mail/mail.service';

const PER_PACKAGE_RATE = 500; // ₦500 per package stored

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(User)                private usersRepo:       Repository<User>,
    @InjectRepository(BusinessAccount)     private bizRepo:         Repository<BusinessAccount>,
    @InjectRepository(BusinessTeamMember)  private teamRepo:        Repository<BusinessTeamMember>,
    @InjectRepository(PartnerStore)        private storeRepo:       Repository<PartnerStore>,
    @InjectRepository(BusinessPackage)     private packagesRepo:    Repository<BusinessPackage>,
    @InjectRepository(BusinessWalletTx)    private walletTxRepo:    Repository<BusinessWalletTx>,
    @InjectRepository(PartnerPayout)       private payoutsRepo:     Repository<PartnerPayout>,
    private mailService: MailService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async getBizAccount(userId: string): Promise<BusinessAccount> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.businessAccountId) throw new ForbiddenException('Business account not found.');
    const biz = await this.bizRepo.findOne({ where: { id: user.businessAccountId } });
    if (!biz) throw new NotFoundException('Business account not found.');
    return biz;
  }

  private async getPartnerStore(userId: string): Promise<PartnerStore> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user?.partnerStoreId) throw new ForbiddenException('Partner store not found.');
    const store = await this.storeRepo.findOne({ where: { id: user.partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found.');
    return store;
  }

  private generateTrackingNumber(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let id = 'SEIRS-';
    for (let i = 0; i < 9; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  // ─── Business Sender: Dashboard ─────────────────────────────────────────────

  async businessDashboard(userId: string) {
    const biz = await this.getBizAccount(userId);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [totalPkgs, weekPkgs] = await Promise.all([
      this.packagesRepo.count({ where: { businessAccountId: biz.id } }),
      this.packagesRepo.count({
        where: { businessAccountId: biz.id, arrivedAt: MoreThanOrEqual(weekStart) },
      }),
    ]);

    const recentPackages = await this.packagesRepo.find({
      where: { businessAccountId: biz.id },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const weekTxs = await this.walletTxRepo.find({
      where: { businessAccountId: biz.id, type: 'debit', createdAt: MoreThanOrEqual(weekStart) },
    });
    const weeklySpend = weekTxs.reduce((s, t) => s + Number(t.amount), 0);

    return {
      totalDeliveries:  totalPkgs,
      activeDeliveries: weekPkgs,
      walletBalance:    Number(biz.walletBalance),
      loyaltyPoints:    biz.loyaltyPoints,
      weeklySpend,
      companyName:      biz.companyName,
      recentDeliveries: recentPackages,
    };
  }

  // ─── Business Sender: Deliveries ────────────────────────────────────────────

  async getDeliveries(userId: string, page = 1, status?: string) {
    const biz = await this.getBizAccount(userId);
    const take = 20;
    const skip = (page - 1) * take;

    const where: any = { businessAccountId: biz.id };
    if (status) where.status = status;

    const [items, total] = await this.packagesRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total, page, hasMore: skip + items.length < total };
  }

  async createDelivery(userId: string, data: any) {
    const biz = await this.getBizAccount(userId);

    const stops: any[] = data.stops ?? [{ recipientName: data.recipientName, recipientPhone: data.recipientPhone }];
    const created = [];

    for (const stop of stops) {
      const trackingNumber = this.generateTrackingNumber();
      const pkg = this.packagesRepo.create({
        trackingNumber,
        qrCode:         trackingNumber,
        recipientName:  stop.recipientName,
        recipientPhone: stop.recipientPhone ?? '',
        status:         PackageStatus.AWAITING_PICKUP,
        partnerStoreId: data.partnerStoreId ?? '',
        businessAccountId: biz.id,
      });
      created.push(await this.packagesRepo.save(pkg));
    }

    // Debit wallet
    const costPerPkg = 1500;
    const totalCost  = costPerPkg * stops.length;
    if (Number(biz.walletBalance) >= totalCost) {
      const balBefore = Number(biz.walletBalance);
      const balAfter  = balBefore - totalCost;
      await this.bizRepo.update(biz.id, { walletBalance: balAfter });
      const tx = this.walletTxRepo.create({
        businessAccountId: biz.id,
        type:          'debit',
        amount:        totalCost,
        description:   `Delivery booking — ${stops.length} stop(s)`,
        reference:     created[0].trackingNumber,
        balanceBefore: balBefore,
        balanceAfter:  balAfter,
      });
      await this.walletTxRepo.save(tx);
    }

    return { packages: created, count: created.length };
  }

  async uploadCsvDeliveries(userId: string, rows: any[]) {
    return this.createDelivery(userId, { stops: rows });
  }

  // ─── Business Sender: Wallet ─────────────────────────────────────────────────

  async getWallet(userId: string) {
    const biz = await this.getBizAccount(userId);
    return {
      balance:       Number(biz.walletBalance),
      loyaltyPoints: biz.loyaltyPoints,
      currency:      'NGN',
    };
  }

  async fundWallet(userId: string, amount: number) {
    if (!amount || amount < 100) throw new BadRequestException('Minimum funding amount is ₦100.');
    const biz = await this.getBizAccount(userId);

    const balBefore = Number(biz.walletBalance);
    const balAfter  = balBefore + amount;
    await this.bizRepo.update(biz.id, { walletBalance: balAfter });

    // Award loyalty points: 1 point per ₦100 funded
    const points = Math.floor(amount / 100);
    await this.bizRepo.update(biz.id, { loyaltyPoints: biz.loyaltyPoints + points });

    const tx = this.walletTxRepo.create({
      businessAccountId: biz.id,
      type:          'credit',
      amount,
      description:   'Wallet top-up',
      reference:     uuidv4(),
      balanceBefore: balBefore,
      balanceAfter:  balAfter,
    });
    await this.walletTxRepo.save(tx);

    return { balance: balAfter, pointsEarned: points, message: 'Wallet funded successfully.' };
  }

  async getTransactions(userId: string, page = 1) {
    const biz  = await this.getBizAccount(userId);
    const take = 20;
    const skip = (page - 1) * take;

    const [items, total] = await this.walletTxRepo.findAndCount({
      where:  { businessAccountId: biz.id },
      order:  { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total, page, hasMore: skip + items.length < total };
  }

  // ─── Business Sender: Team ───────────────────────────────────────────────────

  async getTeam(userId: string) {
    const biz = await this.getBizAccount(userId);
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    const members = await this.teamRepo.find({ where: { businessAccountId: biz.id } });

    // Always include the owner at the top
    const owner = {
      id:       userId,
      name:     user!.name,
      email:    user!.email,
      teamRole: 'owner',
      status:   'active',
    };

    return { members: [owner, ...members] };
  }

  async inviteTeamMember(userId: string, data: { name: string; email: string; teamRole: string }) {
    const biz = await this.getBizAccount(userId);

    const existing = await this.teamRepo.findOne({
      where: { businessAccountId: biz.id, email: data.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException('This email is already in your team.');

    const member = this.teamRepo.create({
      businessAccountId: biz.id,
      name:     data.name,
      email:    data.email.toLowerCase(),
      teamRole: data.teamRole as any,
      status:   'pending',
    });
    await this.teamRepo.save(member);

    await this.mailService.sendEmailVerification(
      data.email,
      data.name,
      'You have been invited to join a Seirs business account.',
    ).catch(() => {});

    return { message: 'Invitation sent.', member };
  }

  async removeTeamMember(userId: string, memberId: string) {
    const biz = await this.getBizAccount(userId);
    const member = await this.teamRepo.findOne({
      where: { id: memberId, businessAccountId: biz.id },
    });
    if (!member) throw new NotFoundException('Team member not found.');
    await this.teamRepo.delete(memberId);
    return { message: 'Team member removed.' };
  }

  // ─── Business Sender: Loyalty ────────────────────────────────────────────────

  async getLoyalty(userId: string) {
    const biz = await this.getBizAccount(userId);
    return {
      points:       biz.loyaltyPoints,
      pointsValue:  biz.loyaltyPoints * 10, // ₦10 per point
      tier:         biz.loyaltyPoints >= 5000 ? 'Gold' : biz.loyaltyPoints >= 1000 ? 'Silver' : 'Bronze',
      nextTierAt:   biz.loyaltyPoints >= 5000 ? null : biz.loyaltyPoints >= 1000 ? 5000 : 1000,
    };
  }

  // ─── Partner Store: Dashboard ────────────────────────────────────────────────

  async partnerDashboard(userId: string) {
    const store = await this.getPartnerStore(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [inStore, awaitingPickup, collectedToday, recentPackages] = await Promise.all([
      this.packagesRepo.count({ where: { partnerStoreId: store.id, status: PackageStatus.IN_STORE } }),
      this.packagesRepo.count({ where: { partnerStoreId: store.id, status: PackageStatus.AWAITING_PICKUP } }),
      this.packagesRepo.count({ where: { partnerStoreId: store.id, status: PackageStatus.COLLECTED, collectedAt: MoreThanOrEqual(today) } }),
      this.packagesRepo.find({
        where: { partnerStoreId: store.id },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    const weekPayouts = await this.payoutsRepo.find({
      where: { partnerStoreId: store.id, createdAt: MoreThanOrEqual(weekStart) },
    });
    const weekEarnings = weekPayouts.reduce((s, p) => s + Number(p.amount), 0);

    return {
      packagesInStore: inStore,
      awaitingPickup,
      collectedToday,
      weekEarnings,
      maxCapacity:     store.maxCapacity,
      recentPackages,
    };
  }

  // ─── Partner Store: Inventory ─────────────────────────────────────────────────

  async getInventory(userId: string, status?: string, page = 1) {
    const store = await this.getPartnerStore(userId);
    const take  = 20;
    const skip  = (page - 1) * take;

    const where: any = { partnerStoreId: store.id };
    if (status) where.status = status;

    const [items, total] = await this.packagesRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total, page, hasMore: skip + items.length < total };
  }

  // ─── Partner Store: Scan ──────────────────────────────────────────────────────

  async scanPackage(userId: string, qrCode: string) {
    const store = await this.getPartnerStore(userId);

    const pkg = await this.packagesRepo.findOne({
      where: [
        { qrCode, partnerStoreId: store.id },
        { trackingNumber: qrCode, partnerStoreId: store.id },
      ],
    });

    if (!pkg) throw new NotFoundException('Package not found at this store.');

    return {
      id:             pkg.id,
      trackingNumber: pkg.trackingNumber,
      recipientName:  pkg.recipientName,
      recipientPhone: pkg.recipientPhone,
      status:         pkg.status,
      arrivedAt:      pkg.arrivedAt,
    };
  }

  // ─── Partner Store: Mark Collected ───────────────────────────────────────────

  async markCollected(userId: string, packageId: string) {
    const store = await this.getPartnerStore(userId);

    const pkg = await this.packagesRepo.findOne({
      where: [
        { id: packageId, partnerStoreId: store.id },
        { trackingNumber: packageId, partnerStoreId: store.id },
      ],
    });

    if (!pkg) throw new NotFoundException('Package not found.');
    if (pkg.status === PackageStatus.COLLECTED) {
      throw new BadRequestException('Package already marked as collected.');
    }

    await this.packagesRepo.update(pkg.id, {
      status:      PackageStatus.COLLECTED,
      collectedAt: new Date(),
    });

    // Credit partner earnings
    const earning = this.payoutsRepo.create({
      partnerStoreId: store.id,
      amount:         PER_PACKAGE_RATE,
      status:         'pending',
      period:         this.currentWeekLabel(),
    });
    await this.payoutsRepo.save(earning);

    return { message: 'Package marked as collected.', trackingNumber: pkg.trackingNumber };
  }

  // ─── Partner Store: Earnings ──────────────────────────────────────────────────

  async getEarnings(userId: string, period: 'week' | 'month') {
    const store = await this.getPartnerStore(userId);

    const since = new Date();
    if (period === 'week') since.setDate(since.getDate() - 7);
    else since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const collectedPkgs = await this.packagesRepo.find({
      where: {
        partnerStoreId: store.id,
        status: PackageStatus.COLLECTED,
        collectedAt: MoreThanOrEqual(since),
      },
      order: { collectedAt: 'ASC' },
    });

    // Build daily buckets
    const dayMap = new Map<string, { amount: number; packages: number }>();
    for (const pkg of collectedPkgs) {
      const d   = new Date(pkg.collectedAt!);
      const key = d.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { amount: 0, packages: 0 };
      cur.amount   += PER_PACKAGE_RATE;
      cur.packages += 1;
      dayMap.set(key, cur);
    }

    const days = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
    const totalEarnings = days.reduce((s, d) => s + d.amount, 0);

    const pendingPayouts = await this.payoutsRepo.find({
      where: { partnerStoreId: store.id, status: 'pending' },
    });
    const pendingPayout = pendingPayouts.reduce((s, p) => s + Number(p.amount), 0);

    const payouts = await this.payoutsRepo.find({
      where: { partnerStoreId: store.id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));

    return {
      totalEarnings,
      totalPackages:  collectedPkgs.length,
      pendingPayout,
      perPackageRate: PER_PACKAGE_RATE,
      nextPayoutDate: nextMonday.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' }),
      days,
      payouts,
    };
  }

  // ─── Partner Store: Settings ──────────────────────────────────────────────────

  async getSettings(userId: string) {
    const store = await this.getPartnerStore(userId);
    return store;
  }

  async updateSettings(userId: string, data: any) {
    const store = await this.getPartnerStore(userId);

    const allowed = [
      'storeName', 'storeAddress', 'phone', 'maxCapacity',
      'operatingDays', 'openTime', 'closeTime',
      'notifyNewPackage', 'notifyPickup', 'notifyPayout',
    ];
    const update: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }

    await this.storeRepo.update(store.id, update);
    return { message: 'Settings updated.' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private currentWeekLabel(): string {
    const now   = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }
}
