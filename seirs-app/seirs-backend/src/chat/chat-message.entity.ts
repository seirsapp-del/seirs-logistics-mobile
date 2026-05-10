import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Delivery } from '../deliveries/delivery.entity';
import { User }     from '../users/user.entity';

@Entity('chat_messages')
@Index(['delivery'])
@Index(['createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Each conversation is scoped to a delivery — both customer and driver
  // join `chat:<deliveryId>` to exchange messages. There is no separate
  // "thread" entity; the delivery itself is the chat thread.
  @ManyToOne(() => Delivery, { onDelete: 'CASCADE' })
  @JoinColumn()
  delivery: Delivery;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn()
  sender: User;

  @Column('text')
  body: string;

  // Set when the *other* party loads the conversation. Lets us show the
  // double-tick "read" indicator without a separate receipts table.
  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
