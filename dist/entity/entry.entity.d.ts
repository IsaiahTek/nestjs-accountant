export declare enum Direction {
    DEBIT = "DEBIT",
    CREDIT = "CREDIT"
}
export declare class Entry {
    id: string;
    tenantId?: string;
    transactionId: string;
    accountId: string;
    direction: Direction;
    amountMinor: string;
    currency: string;
    baseCurrency?: string;
    baseAmountMinor?: string;
    exchangeRate?: string;
    description: string;
    createdAt: Date;
}
