import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async updateFcmToken(userId: string, token: string) {
    await this.repo.update(userId, { fcmToken: token });
  }

  async updateProfile(userId: string, data: Partial<Pick<User, 'name' | 'phone' | 'profilePhoto'>>) {
    await this.repo.update(userId, data);
    return this.findById(userId);
  }

  // Spec V8 — NDPR right to erasure. Soft-delete first (isActive=false)
  // so we keep audit trails for any pending disputes; a follow-up cron
  // hard-deletes after a 30-day grace window.
  async deleteAccount(userId: string, password: string) {
    const user = await this.repo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('Account not found');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new BadRequestException('Password did not match — account not deleted.');

    await this.repo.update(userId, { isActive: false });
    return { message: 'Account scheduled for deletion. You have 30 days to cancel by logging in again.' };
  }
}
