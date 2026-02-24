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
    ownerId: string | null;
    accountType: AccountType;
    isFrozen: boolean;
    createdAt: Date;
}
