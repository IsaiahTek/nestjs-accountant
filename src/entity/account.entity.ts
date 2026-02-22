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
@Index(['tenantId', 'ownerId', 'accountType'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔥 Multi-tenant SaaS isolation
  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  // Can represent userId, vendorId, or null for platform accounts
  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'enum', enum: AccountType })
  accountType: AccountType;

  @Column({ default: false })
  isFrozen: boolean; // For disputes / compliance freezes

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}