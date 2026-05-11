import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Driver } from './driver.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { Wallet } from '../payments/wallet.entity';
import { FraudService } from '../fraud/fraud.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

// Spec V8 §2.1 — recognised KYC document IDs
const KYC_DOC_FIELD_MAP: Record<string, keyof Driver> = {
  national_id_front: 'nationalIdFrontUrl',
  national_id_back:  'nationalIdBackUrl',
  drivers_license:   'driversLicenseUrl',
  vehicle_photo:     'vehiclePhotoUrl',
  ownership_proof:   'ownershipProofUrl',
  insurance_cert:    'insuranceCertUrl',
  selfie:            'selfieUrl',
  guarantor:         'guarantorUrl',
};

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)   private repo:           Repository<Driver>,
    @InjectRepository(Delivery) private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(Wallet)   private walletsRepo:    Repository<Wallet>,
    private fraudService:    FraudService,
    private trackingGateway: TrackingGateway,
  ) {}

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { user: { id: userId } }, relations: ['user'] });
  }

  /**
   * Driver profile enriched with the three earnings fields the home
   * screen reads: today, this-week (Monday-rollover), and wallet
   * balance in Naira (kobo / 100). Returns the same shape as
   * findByUserId() plus those three numeric fields.
   */
  async findByUserIdWithEarnings(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) return null;

    // Date boundaries — start of today (local server tz) and start of week (Mon).
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    const dayIdx = startOfWeek.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const offsetToMon = dayIdx === 0 ? 6 : dayIdx - 1;
    startOfWeek.setDate(startOfWeek.getDate() - offsetToMon);

    // Sum driverEarnings of completed deliveries since each cutoff in parallel.
    const [todayRow, weekRow, wallet] = await Promise.all([
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('COALESCE(SUM(d.driverEarnings), 0)', 'sum')
        .where('d.driverId = :driverId', { driverId: driver.id })
        .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
        .andWhere('d.deliveredAt >= :cutoff', { cutoff: startOfToday })
        .getRawOne<{ sum: string }>(),
      this.deliveriesRepo
        .createQueryBuilder('d')
        .select('COALESCE(SUM(d.driverEarnings), 0)', 'sum')
        .where('d.driverId = :driverId', { driverId: driver.id })
        .andWhere('d.status = :status', { status: DeliveryStatus.DELIVERED })
        .andWhere('d.deliveredAt >= :cutoff', { cutoff: startOfWeek })
        .getRawOne<{ sum: string }>(),
      this.walletsRepo.findOne({ where: { user: { id: userId } } }),
    ]);

    return {
      ...driver,
      todayEarnings: Number(todayRow?.sum ?? 0),
      weekEarnings:  Number(weekRow?.sum  ?? 0),
      // balanceKobo is bigint in DB → string at runtime; coerce to number then naira.
      balance:       wallet ? Number(wallet.balanceKobo) / 100 : 0,
    };
  }

  async toggleOnline(userId: string, isOnline: boolean) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    // Spec V8 §2.12 — driver CANNOT go offline while holding active jobs.
    // Otherwise customers' packages get abandoned mid-route.
    if (!isOnline) {
      const activeCount = await this.deliveriesRepo.count({
        where: {
          driver: { id: driver.id },
          status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
        },
      });
      if (activeCount > 0) {
        throw new BadRequestException(
          `ACTIVE_JOBS_PRESENT: complete or hand off your ${activeCount} active ` +
          `${activeCount === 1 ? 'job' : 'jobs'} before going offline.`,
        );
      }
    }

    await this.repo.update(driver.id, { isOnline });
    return { isOnline };
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new NotFoundException('Invalid coordinates.');
    }

    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    // GPS velocity fraud check — compare with last known position
    if (driver.lastLat != null && driver.lastLng != null && driver.locationUpdatedAt) {
      const elapsedSeconds = (Date.now() - new Date(driver.locationUpdatedAt).getTime()) / 1000;
      if (elapsedSeconds > 0 && elapsedSeconds < 3600) {
        this.fraudService
          .checkGpsAnomaly(userId, driver.lastLat, driver.lastLng, lat, lng, elapsedSeconds)
          .catch(() => {});
      }
    }

    await this.repo.update(driver.id, {
      lastLat:           lat,
      lastLng:           lng,
      locationUpdatedAt: new Date(),
    });

    // Broadcast to any customers tracking this driver's active delivery.
    // Without this WS broadcast, the customer's tracking screen never sees
    // GPS updates because the driver app uses REST (not the WS
    // driver:update-location event). See ECOSYSTEM_AUDIT_2026-05-10.md
    // section B2/B3.
    const activeDelivery = await this.deliveriesRepo.findOne({
      where: {
        driver: { id: driver.id },
        status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
      },
      select: ['id'],
    });
    if (activeDelivery) {
      this.trackingGateway.broadcastDriverLocation(activeDelivery.id, driver.id, lat, lng);
    }
  }

  // Find available online drivers near a point (Haversine radius query)
  findNearby(lat: number, lng: number, radiusKm: number = 10) {
    // Validate inputs before use in query
    const safeLat = Number(lat);
    const safeLng = Number(lng);
    const safeRadius = Number(radiusKm);

    if (
      isNaN(safeLat) || isNaN(safeLng) || isNaN(safeRadius) ||
      safeLat < -90 || safeLat > 90 || safeLng < -180 || safeLng > 180
    ) {
      return Promise.resolve([]);
    }

    // Haversine formula — WHERE clause uses parameterized values (:lat, :lng, :radius)
    // ORDER BY uses validated numeric literals (no user-controlled strings)
    return this.repo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.user', 'user')
      .where('driver.isOnline = true')
      .andWhere('driver.status = :status', { status: 'approved' })
      .andWhere(
        `(6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(:lat)) * cos(radians(driver.lastLat)) *
          cos(radians(driver.lastLng) - radians(:lng)) +
          sin(radians(:lat)) * sin(radians(driver.lastLat))
        )))) < :radius`,
        { lat: safeLat, lng: safeLng, radius: safeRadius },
      )
      .orderBy(
        // Safe: safeLat/safeLng are validated numbers, not user-supplied strings
        `(6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(${safeLat})) * cos(radians(driver.lastLat)) *
          cos(radians(driver.lastLng) - radians(${safeLng})) +
          sin(radians(${safeLat})) * sin(radians(driver.lastLat))
        ))))`,
        'ASC',
      )
      .getMany();
  }

  // Spec V8 — driver pre-deletion readiness check. Drivers with active
  // deliveries or non-zero wallet balance can't be deleted; the UI
  // surfaces the blockers so the driver knows what to do (complete or
  // hand-off the deliveries; withdraw the balance) before retrying.
  async getDeletionReadiness(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver) {
      return { isDriver: false, ready: true, blockers: [] };
    }

    const blockers: Array<{ type: string; count: number; action: string }> = [];

    // Active deliveries — anything not yet delivered or cancelled
    const activeCount = await this.deliveriesRepo.count({
      where: [
        { driver: { id: driver.id }, status: DeliveryStatus.ASSIGNED },
        { driver: { id: driver.id }, status: DeliveryStatus.PICKED_UP },
        { driver: { id: driver.id }, status: DeliveryStatus.IN_TRANSIT },
      ],
    });
    if (activeCount > 0) {
      blockers.push({
        type:   'active_deliveries',
        count:  activeCount,
        action: 'Complete or contact ops to reassign these deliveries first.',
      });
    }

    // Non-zero wallet balance
    const balance = Number(driver.walletBalance ?? 0);
    if (balance > 0) {
      blockers.push({
        type:   'wallet_balance',
        count:  Math.round(balance),
        action: `Withdraw your ₦${Math.round(balance).toLocaleString()} wallet balance before deleting.`,
      });
    }

    return {
      isDriver: true,
      ready:    blockers.length === 0,
      blockers,
      driverId: driver.id,
    };
  }

  // Spec V8 §2.1 — record uploaded KYC document URL against the right column.
  async updateKycDoc(userId: string, docId: string, url: string) {
    const field = KYC_DOC_FIELD_MAP[docId];
    if (!field) throw new BadRequestException(`Unknown KYC document id: ${docId}`);
    if (!url || typeof url !== 'string') throw new BadRequestException('Document URL required.');

    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');

    await this.repo.update(driver.id, { [field]: url } as Partial<Driver>);
    return { docId, saved: true };
  }

  // Spec V8 §2.10 / §2.18 — derive demand zones from recent pickup density
  // around the driver's current position. Buckets ~1km grid cells over the
  // last 7 days of completed/active orders. Intensity = order count.
  async getDemandZones(userId: string) {
    const driver = await this.findByUserId(userId);
    if (!driver?.lastLat || !driver?.lastLng) {
      return { zones: [] };
    }

    const lat = Number(driver.lastLat);
    const lng = Number(driver.lastLng);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Round to ~1km grid (0.01 deg ≈ 1.1km in Nigeria latitudes)
    const rows = await this.deliveriesRepo
      .createQueryBuilder('d')
      .select('ROUND(d.pickupLat::numeric, 2)', 'lat')
      .addSelect('ROUND(d.pickupLng::numeric, 2)', 'lng')
      .addSelect('COUNT(d.id)', 'count')
      .where('d.createdAt >= :since', { since })
      .andWhere('d.status IN (:...statuses)', {
        statuses: [DeliveryStatus.DELIVERED, DeliveryStatus.IN_TRANSIT, DeliveryStatus.PICKED_UP, DeliveryStatus.ASSIGNED],
      })
      .andWhere(
        '(6371 * acos(LEAST(1, GREATEST(-1, ' +
          'cos(radians(:lat)) * cos(radians(d.pickupLat)) * ' +
          'cos(radians(d.pickupLng) - radians(:lng)) + ' +
          'sin(radians(:lat)) * sin(radians(d.pickupLat))' +
        ')))) < :radius',
        { lat, lng, radius: 25 },
      )
      .groupBy('ROUND(d.pickupLat::numeric, 2)')
      .addGroupBy('ROUND(d.pickupLng::numeric, 2)')
      .orderBy('COUNT(d.id)', 'DESC')
      .limit(20)
      .getRawMany();

    if (!rows.length) return { zones: [] };

    const maxCount = Math.max(...rows.map(r => Number(r.count)));
    return {
      zones: rows.map(r => {
        const count = Number(r.count);
        const intensity = count / maxCount; // 0.0 - 1.0
        return {
          latitude:  Number(r.lat),
          longitude: Number(r.lng),
          radiusM:   400 + intensity * 600,        // 400-1000m
          intensity,
          orderCount: count,
        };
      }),
    };
  }
}
