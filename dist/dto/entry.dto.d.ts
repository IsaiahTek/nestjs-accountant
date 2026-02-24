import { Direction } from '../entity/entry.entity';
export declare class EntryDto {
    accountId: string;
    direction: Direction;
    description: string;
    tenantId?: string;
    amountMinor: string;
    currency: string;
}
