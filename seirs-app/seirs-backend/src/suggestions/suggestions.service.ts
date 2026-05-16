import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Suggestion, SuggestionCategory, SuggestionStatus } from './suggestion.entity';
import { SuggestionVote } from './suggestion-vote.entity';

@Injectable()
export class SuggestionsService {
  constructor(
    @InjectRepository(Suggestion)     private repo:  Repository<Suggestion>,
    @InjectRepository(SuggestionVote) private votes: Repository<SuggestionVote>,
  ) {}

  // ── Customer + driver ─────────────────────────────────────────────────────
  async submit(userId: string, body: {
    subject: string; body: string; category?: SuggestionCategory;
  }) {
    const subject = body.subject?.trim();
    const text    = body.body?.trim();
    if (!subject || subject.length < 6) throw new BadRequestException('Subject must be at least 6 characters.');
    if (!text    || text.length    < 12) throw new BadRequestException('Body must be at least 12 characters.');

    const row = this.repo.create({
      subject,
      body:        text,
      category:    body.category ?? SuggestionCategory.FEATURE,
      submittedBy: { id: userId } as any,
    });
    return this.repo.save(row);
  }

  list(opts: { page?: number; status?: SuggestionStatus; category?: SuggestionCategory } = {}) {
    const page  = opts.page ?? 1;
    const take  = 30;
    const where: any = {};
    if (opts.status)   where.status   = opts.status;
    if (opts.category) where.category = opts.category;
    return this.repo.findAndCount({
      where,
      order: { voteCount: 'DESC', createdAt: 'DESC' },
      take,
      skip: (page - 1) * take,
    }).then(([items, total]) => ({ items, total, page, take }));
  }

  async vote(userId: string, suggestionId: string) {
    const row = await this.repo.findOne({ where: { id: suggestionId } });
    if (!row) throw new NotFoundException('Suggestion not found.');

    const existing = await this.votes.findOne({
      where: { userId, suggestion: { id: suggestionId } },
    });
    if (existing) return { voted: true, voteCount: row.voteCount };

    const vote = this.votes.create({ userId, suggestion: row });
    await this.votes.save(vote);
    row.voteCount += 1;
    await this.repo.save(row);
    return { voted: true, voteCount: row.voteCount };
  }

  async unvote(userId: string, suggestionId: string) {
    const row = await this.repo.findOne({ where: { id: suggestionId } });
    if (!row) throw new NotFoundException('Suggestion not found.');

    const existing = await this.votes.findOne({
      where: { userId, suggestion: { id: suggestionId } },
    });
    if (!existing) return { voted: false, voteCount: row.voteCount };

    await this.votes.remove(existing);
    row.voteCount = Math.max(0, row.voteCount - 1);
    await this.repo.save(row);
    return { voted: false, voteCount: row.voteCount };
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  async updateStatus(id: string, body: { status?: SuggestionStatus; adminReply?: string }) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Suggestion not found.');
    if (body.status)     row.status     = body.status;
    if (body.adminReply !== undefined) row.adminReply = body.adminReply;
    return this.repo.save(row);
  }
}
