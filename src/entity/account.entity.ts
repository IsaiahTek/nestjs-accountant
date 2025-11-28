// src/ledger/entities/account.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

export enum AccountType {
  USER_WALLET = 'USER_WALLET',
  PLATFORM_REVENUE = 'PLATFORM_REVENUE',
  PLATFORM_FEE = 'PLATFORM_FEE',
  TAX_LIABILITY = 'TAX_LIABILITY', // New for VAT/Tax owed to government
  EXTERNAL_CASH = 'EXTERNAL_CASH',
}

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'enum', enum: AccountType })
  accountType: AccountType;

  @Column({ length: 3 })
  currency: string; 

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  currentBalance: number; // The cached balance

  // Omitting @OneToMany for brevity in this example
}