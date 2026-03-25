// src/ledger/entities/entry.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum Direction {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('entries')
@Index(['tenantId', 'transactionId'])
@Index(['tenantId', 'accountId'])
export class Entry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'enum', enum: Direction })
  direction: Direction;

  // 🔥 Minor units
  @Column({ type: 'bigint' })
  amountMinor: string;

  @Column({ length: 3 })
  currency: string;

  // 🌍 Multi-currency reporting
  @Column({ type: 'varchar', length: 3, nullable: true })
  baseCurrency?: string;

  @Column({ type: 'bigint', nullable: true })
  baseAmountMinor?: string;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  exchangeRate?: string;

  @Column()
  description: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
