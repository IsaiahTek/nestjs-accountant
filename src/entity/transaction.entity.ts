// src/ledger/entities/transaction.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum TransactionStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
  FAILED = 'FAILED',
}

// export enum TransactionType {
//   PAYMENT_CAPTURE = 'PAYMENT_CAPTURE',
//   ESCROW_LOCK = 'ESCROW_LOCK',
//   ESCROW_RELEASE = 'ESCROW_RELEASE',
//   VENDOR_PAYOUT = 'VENDOR_PAYOUT',
//   REFUND = 'REFUND',
//   DISPUTE = 'DISPUTE',
//   FX_CONVERSION = 'FX_CONVERSION',
//   REVERSAL = 'REVERSAL',
// }

@Entity('transactions')
@Index(['tenantId', 'idempotencyKey'], { unique: true })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  // 🔥 Total amount in minor units (for main currency of txn)
  @Column({ type: 'bigint' })
  amountMinor: string;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ type: 'varchar', nullable: true })
  type?: string;

  @Column({ nullable: true })
  gatewayRefId?: string | null;

  // 🔥 Idempotency for webhook retries
  @Column({ nullable: true })
  idempotencyKey?: string;

  // 🔥 Optional FX support
  @Column({ nullable: true })
  fxRate: string;

  @Column({ length: 3, nullable: true })
  sourceCurrency: string;

  @Column({ length: 3, nullable: true })
  targetCurrency: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
