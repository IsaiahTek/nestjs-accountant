export declare enum TransactionStatus {
    PENDING = "PENDING",
    POSTED = "POSTED",
    REVERSED = "REVERSED",
    FAILED = "FAILED"
}
export declare class Transaction {
    id: string;
    tenantId?: string;
    amountMinor: string;
    currency: string;
    status: TransactionStatus;
    idempotencyKey?: string;
    referenceType?: string;
    referenceId?: string;
    tags?: string[];
    context?: Record<string, any>;
    metadata: Record<string, any>;
    baseCurrency?: string;
    baseAmountMinor?: string;
    exchangeRate?: string;
    reversalOf?: string;
    createdAt: Date;
}
