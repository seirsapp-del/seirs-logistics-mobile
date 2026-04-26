import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
