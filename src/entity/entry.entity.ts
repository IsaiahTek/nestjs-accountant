// src/ledger/entities/entry.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';

export enum Direction {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('entries')
export class Entry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'enum', enum: Direction })
  direction: Direction;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column()
  description: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}