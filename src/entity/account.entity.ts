// src/ledger/entities/account.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum AccountType {
  ASSET,
  LIABILITY,
  EQUITY,
  REVENUE,
  EXPENSE
}

@Entity('accounts')
@Index(['tenantId', 'accountType'])
@Index(['tenantId', 'referenceType', 'referenceId'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔥 Multi-tenant SaaS isolation
  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'enum', enum: AccountType })
  accountType: AccountType;

  // ✨ Domain Agnostic Generic Primitives
  @Column({ type: 'varchar', nullable: true })
  referenceType?: string;

  @Column({ type: 'varchar', nullable: true })
  referenceId?: string;

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ default: false })
  isFrozen: boolean; // For disputes / compliance freezes

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}