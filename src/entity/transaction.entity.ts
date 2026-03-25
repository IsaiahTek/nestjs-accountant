// src/ledger/entities/transaction.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum TransactionStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
  FAILED = 'FAILED',
}

@Entity('transactions')
@Index(['tenantId', 'idempotencyKey'], { unique: true })
@Index(['tenantId', 'referenceType', 'referenceId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  // 🔥 Total amount in minor units (for main currency of txn)
  @Column({ type: 'bigint' })
  amountMinor: string;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey?: string;

  @Column({ type: 'varchar', nullable: true })
  referenceType?: string;

  @Column({ type: 'varchar', nullable: true })
  referenceId?: string;

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // 🌍 Multi-currency reporting (Base currency)
  @Column({ type: 'varchar', length: 3, nullable: true })
  baseCurrency?: string;

  @Column({ type: 'bigint', nullable: true })
  baseAmountMinor?: string;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  exchangeRate?: string;

  // 🔄 Reversal tracking
  @Column({ type: 'uuid', nullable: true })
  reversalOf?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
