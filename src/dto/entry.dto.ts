// src/ledger/dto/entry.dto.ts
import { Direction } from '../entity/entry.entity';

export class EntryDto {
  accountId: string;
  direction: Direction;
  description: string;
  tenantId?: string;
  amountMinor: string;
  currency: string;
}