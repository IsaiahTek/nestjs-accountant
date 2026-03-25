import { Direction } from '../entity/entry.entity';
export declare class EntryDto {
    accountId: string;
    direction: Direction;
    description: string;
    tenantId?: string;
    amountMinor: string | bigint;
    currency: string;
    baseCurrency?: string;
    baseAmountMinor?: string | bigint;
    exchangeRate?: string | number;
}
