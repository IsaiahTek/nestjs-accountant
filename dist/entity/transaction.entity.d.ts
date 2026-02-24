export declare enum TransactionStatus {
    PENDING = "PENDING",
    POSTED = "POSTED",
    REVERSED = "REVERSED",
    FAILED = "FAILED"
}
export declare class Transaction {
    id: string;
    tenantId?: string;
    ownerId: string | null;
    amountMinor: string;
    currency: string;
    status: TransactionStatus;
    type?: string;
    gatewayRefId?: string | null;
    idempotencyKey?: string;
    fxRate: string;
    sourceCurrency: string;
    targetCurrency: string;
    metadata: Record<string, any>;
    createdAt: Date;
}
