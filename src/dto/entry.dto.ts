// src/ledger/dto/entry.dto.ts
import { Direction } from '../entity/entry.entity';

export class EntryDto {
  accountId: string;
  direction: Direction;
  description: string;
  tenantId?: string;
  amountMinor: string | bigint;
  currency: string;

  // 🌍 Multi-currency reporting
  baseCurrency?: string;
  baseAmountMinor?: string | bigint;
  exchangeRate?: string | number;
}