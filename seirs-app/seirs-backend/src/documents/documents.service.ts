import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { UserDocument, UserDocumentCategory } from './user-document.entity';
import { Notification } from '../notifications/notification.entity';

const CATEGORIES: UserDocumentCategory[] = ['statement', 'contract', 'letter', 'policy', 'other'];

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(UserDocument) private readonly repo: Repository<UserDocument>,
    private readonly dataSource: DataSource,
  ) {}

  /** All documents for the requesting user, newest first. */
  listMine(userId: string) {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take:  100,
    });
  }

  /**
   * Admin sends an official document to a user. Either inline body text
   * or a fileUrl (R2/S3 link). Drops an in-app notification so the user
   * finds it without being told.
   */
  async sendToUser(
    targetUserId: string,
    input: { title: string; category?: string; body?: string; fileUrl?: string },
    admin: { id?: string; name?: string },
  ) {
    if (!input?.title?.trim()) throw new BadRequestException('Title is required.');
    if (!input?.body?.trim() && !input?.fileUrl?.trim()) {
      throw new BadRequestException('Provide document body text or a file URL.');
    }
    const category = (CATEGORIES as string[]).includes(input.category ?? '')
      ? (input.category as UserDocumentCategory)
      : 'other';

    const doc = await this.repo.save(this.repo.create({
      id:            randomUUID(),
      userId:        targetUserId,
      title:         input.title.trim().slice(0, 200),
      category,
      body:          input.body?.trim() || null,
      fileUrl:       input.fileUrl?.trim() || null,
      sentByAdminId: admin?.id ?? null,
      sentByName:    admin?.name ?? null,
    }));

    // In-app notification (best-effort). Uses the repository directly so
    // this module stays decoupled from NotificationsModule.
    try {
      const notifRepo = this.dataSource.getRepository(Notification);
      await notifRepo.save(notifRepo.create({
        userId: targetUserId,
        title:  'New document from SEIRS',
        body:   `"${doc.title}" is now in your Documents. Open the menu to view it.`,
        type:   'general',
      } as any));
    } catch (e: any) {
      this.logger.warn(`document notification failed: ${e?.message ?? e}`);
    }

    return doc;
  }
}
