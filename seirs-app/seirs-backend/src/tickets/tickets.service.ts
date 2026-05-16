import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketPriority, TicketStatus } from '../admin/support-ticket.entity';
import { User } from '../users/user.entity';

interface CreateTicketInput {
  subject:     string;
  description: string;
  category?:   string;
  // Optional priority hint from the client. Backend may override based on
  // category (e.g. driver behaviour → HIGH) — see resolvePriority.
  priority?:   TicketPriority;
  // Free-form metadata. We keep tripId in the description for now so the
  // admin queue can search/filter on it without a new column.
  tripId?:     string;
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly repo: Repository<SupportTicket>,
  ) {}

  // Auto-escalate categories that always need fast triage, regardless of
  // what the client requested. Per docs/launch/07-dispute-resolution-playbook.md
  private resolvePriority(category: string | undefined, hint?: TicketPriority): TicketPriority {
    const c = (category ?? '').toLowerCase();
    if (c === 'driver' || c === 'safety' || c === 'lost_item') return TicketPriority.HIGH;
    if (c === 'overcharge')                                     return TicketPriority.HIGH;
    return hint ?? TicketPriority.MEDIUM;
  }

  async createForUser(user: User, input: CreateTicketInput): Promise<SupportTicket> {
    const description = [
      input.description,
      input.tripId ? `\n\n— Linked trip: ${input.tripId}` : '',
    ].join('').trim();

    const ticket = this.repo.create({
      subject:     input.subject.slice(0, 200),
      description,
      category:    input.category,
      status:      TicketStatus.OPEN,
      priority:    this.resolvePriority(input.category, input.priority),
      userId:      user.id,
      userName:    user.name,
      userEmail:   user.email,
      replies:     [],
    });
    return this.repo.save(ticket);
  }

  async listMine(userId: string): Promise<SupportTicket[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take:  50,
    });
  }
}
