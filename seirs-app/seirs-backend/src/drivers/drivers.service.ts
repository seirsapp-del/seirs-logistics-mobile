import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver } from './driver.entity';

@Injectable()
export class DriversService {
  constructor(@InjectRepository(Driver) private repo: Repository<Driver>) {}

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { user: { id: userId } }, relations: ['user'] });
  }

  async toggleOnline(userId: string, isOnline: boolean) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    await this.repo.update(driver.id, { isOnline });
    return { isOnline };
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    const driver = await this.findByUserId(userId);
    if (!driver) throw new NotFoundException('Driver profile not found.');
    await this.repo.update(driver.id, { lastLat: lat, lastLng: lng });
  }

  // Find available online drivers near a point (simple radius query)
  findNearby(lat: number, lng: number, radiusKm: number = 10) {
    // Uses Haversine formula via raw SQL
    return this.repo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.user', 'user')
      .where('driver.isOnline = true')
      .andWhere('driver.status = :status', { status: 'approved' })
      .andWhere(
        `(6371 * acos(
          cos(radians(:lat)) * cos(radians(driver.lastLat)) *
          cos(radians(driver.lastLng) - radians(:lng)) +
          sin(radians(:lat)) * sin(radians(driver.lastLat))
        )) < :radius`,
        { lat, lng, radius: radiusKm },
      )
      .orderBy(
        `(6371 * acos(
          cos(radians(${lat})) * cos(radians(driver.lastLat)) *
          cos(radians(driver.lastLng) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(driver.lastLat))
        ))`,
        'ASC',
      )
      .getMany();
  }
}
