import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index, RelationId,
} from 'typeorm';
import { Delivery } from '../deliveries/delivery.entity';
import { User }     from '../users/user.entity';

@Entity('chat_messages')
@Index(['delivery'])
@Index(['createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Each conversation is scoped to a delivery. Both customer and driver
  // join `chat:<deliveryId>` to exchange messages. There is no separate
  // "thread" entity; the delivery itself is the chat thread.
  // Nullable since support tickets reuse this table: a support message
  // belongs to a ticket and has no delivery at all. Writing one used to
  // hit a NOT NULL on deliveryId and fail the whole request with a 500,
  // which is why opening a support ticket was broken (2026-08-16).
  @ManyToOne(() => Delivery, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  delivery: Delivery | null;

  /**
   * The delivery's id as a plain readable property.
   *
   * listConversations selected 'm.deliveryId' and then read
   * (row as any).deliveryId, but the entity only had the `delivery`
   * RELATION, so with getMany() that property was always undefined.
   * Every conversation got keyed under undefined, `last` came back
   * undefined, and the code dropped it. The result: BOTH inboxes were
   * permanently empty for everyone, in all three apps, while the
   * messages themselves saved and were readable inside a thread.
   * Confirmed live 2026-08-24: the founder sent a message and the
   * driver's inbox and unread badge both stayed at zero.
   */
  @RelationId((m: ChatMessage) => m.delivery)
  deliveryId: string | null;

  /**
   * Support ticket this message belongs to, when it is not a delivery
   * conversation. Declared here because TypeORM silently DROPS any
   * property the entity does not know: support wrote ticketId through a
   * cast, so every ticket message was saved detached from its ticket.
   * Kept as a plain uuid column rather than a relation so chat does not
   * have to import the support module.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  ticketId: string | null;

  // Nullable so system messages (driver assigned, picked up, delivered) can
  // exist without a real user sender. Clients render sender-less messages
  // as centered status pills.
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn()
  sender: User | null;

  @Column('text')
  body: string;

  // Optional image attachment. Stored in Cloudflare R2 under the `chat/`
  // folder and referenced here as the public CDN URL. When set, the body
  // acts as an optional caption (and may be an empty string).
  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  // Set when the *other* party loads the conversation. Lets us show the
  // double-tick "read" indicator without a separate receipts table.
  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  // System messages are auto-inserted by the platform when the delivery
  // state changes (driver assigned, picked up, delivered, cancelled).
  // NULL for normal user-sent messages. Client renders known systemTypes
  // via i18n keys so the same event reads in the user's language.
  @Column({ type: 'varchar', length: 40, nullable: true })
  systemType: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
