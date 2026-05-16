import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddressType, SavedAddress } from './saved-address.entity';
import { User } from '../users/user.entity';

interface UpsertAddressInput {
  label: string;
  text:  string;
  type:  AddressType;
  lat?:  number;
  lng?:  number;
}

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(SavedAddress)
    private readonly repo: Repository<SavedAddress>,
  ) {}

  list(userId: string): Promise<SavedAddress[]> {
    return this.repo.find({
      where:    { user: { id: userId } },
      order:    { createdAt: 'ASC' },
    });
  }

  create(user: User, input: UpsertAddressInput): Promise<SavedAddress> {
    const addr = this.repo.create({
      user,
      label: input.label.slice(0, 64),
      text:  input.text.slice(0, 500),
      type:  input.type,
      lat:   input.lat,
      lng:   input.lng,
    });
    return this.repo.save(addr);
  }

  async update(userId: string, id: string, input: Partial<UpsertAddressInput>): Promise<SavedAddress> {
    const existing = await this.repo.findOne({ where: { id, user: { id: userId } } });
    if (!existing) throw new NotFoundException('Address not found.');
    Object.assign(existing, {
      label: input.label !== undefined ? input.label.slice(0, 64)  : existing.label,
      text:  input.text  !== undefined ? input.text.slice(0,  500) : existing.text,
      type:  input.type  ?? existing.type,
      lat:   input.lat   ?? existing.lat,
      lng:   input.lng   ?? existing.lng,
    });
    return this.repo.save(existing);
  }

  async delete(userId: string, id: string): Promise<{ deleted: true }> {
    const existing = await this.repo.findOne({ where: { id, user: { id: userId } } });
    if (!existing) throw new NotFoundException('Address not found.');
    await this.repo.delete(id);
    return { deleted: true };
  }
}
