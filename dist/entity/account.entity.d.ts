export declare enum AccountType {
    ASSET = 0,
    LIABILITY = 1,
    EQUITY = 2,
    REVENUE = 3,
    EXPENSE = 4
}
export declare class Account {
    id: string;
    tenantId?: string;
    accountType: AccountType;
    referenceType?: string;
    referenceId?: string;
    tags?: string[];
    context?: Record<string, any>;
    metadata?: Record<string, any>;
    isFrozen: boolean;
    createdAt: Date;
}
