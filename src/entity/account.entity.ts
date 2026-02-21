// src/ledger/entities/account.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export enum AccountType {
  CUSTOMER_WALLET = 'CUSTOMER_WALLET',

  VENDOR_ESCROW = 'VENDOR_ESCROW',
  VENDOR_AVAILABLE = 'VENDOR_AVAILABLE',

  PLATFORM_CUSTODY = 'PLATFORM_CUSTODY',
  PLATFORM_REVENUE = 'PLATFORM_REVENUE',
  PLATFORM_FEE = 'PLATFORM_FEE',
  TAX_LIABILITY = 'TAX_LIABILITY',
  REFUND_PAYABLE = 'REFUND_PAYABLE',
  RISK_RESERVE = 'RISK_RESERVE',

  EXTERNAL_CLEARING = 'EXTERNAL_CLEARING',
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