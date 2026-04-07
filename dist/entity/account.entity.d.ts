export declare enum AccountType {
    ASSET = "ASSET",
    LIABILITY = "LIABILITY",
    EQUITY = "EQUITY",
    REVENUE = "REVENUE",
    EXPENSE = "EXPENSE"
}
export declare class Account {
    id: string;
    tenantId?: string;
    accountType: AccountType;
    allowNegative: boolean;
    referenceType?: string;
    referenceId?: string;
    tags?: string[];
    context?: Record<string, any>;
    metadata?: Record<string, any>;
    isFrozen: boolean;
    createdAt: Date;
}
