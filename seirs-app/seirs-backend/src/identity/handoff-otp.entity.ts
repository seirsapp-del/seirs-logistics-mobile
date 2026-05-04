import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// Email-delivered OTP issued to a recipient at handoff time. Spec V8 says
// SMS is post-launch — OTPs go via Resend SMTP for now.
//
// Single-use: marked consumed once verified. Expires after 10 minutes.
@Entity('handoff_otps')
export class HandoffOtp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deliveryId: string;

  @Index()
  @Column()
  recipientUserId: string;

  // bcrypt hash of the 6-digit code — never store the raw OTP
  @Column({ select: false })
  codeHash: string;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  consumed: boolean;

  @Column({ nullable: true })
  consumedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
