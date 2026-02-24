// src/ledger/entities/balance.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('balances')
@Index(['accountId', 'currency'], { unique: true })
export class Balance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ length: 3 })
  currency: string; // ISO 4217

  // 🔥 Minor units only (cents, kobo, etc.)
  @Column({ type: 'bigint', default: 0 })
  amountMinor: string; // stored as string for bigint safety

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
