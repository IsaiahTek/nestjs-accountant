import { DataSource } from 'typeorm';
import { Transaction, TransactionStatus } from '../entity/transaction.entity';
import { EntryDto } from '../dto/entry.dto';
import { Account, AccountType } from '../entity/account.entity';
export declare class LedgerService {
    private dataSource;
    constructor(dataSource: DataSource);
    createAccount(payload: {
        tenantId: string;
        accountType: AccountType;
        referenceType?: string;
        referenceId?: string;
        tags?: string[];
        context?: Record<string, any>;
        metadata?: Record<string, any>;
    }): Promise<Account>;
    findAccountById(accountId: string, tenantId: string): Promise<Account>;
    findAccountByReference(referenceId: string, referenceType: string, tenantId: string): Promise<Account>;
    findPendingTransactionByReference(referenceId: string, referenceType: string, tenantId: string): Promise<Transaction>;
    findTransactionByReference(referenceId: string, referenceType: string, tenantId: string): Promise<Transaction>;
    findPendingTransactionById(transactionId: string, tenantId: string): Promise<Transaction>;
    private getBalanceKey;
    private parseBalanceKey;
    private applyBalanceDelta;
    private aggregateDeltas;
    createTransaction(payload: {
        tenantId: string;
        referenceType?: string;
        referenceId?: string;
        entriesData: EntryDto[];
        idempotencyKey?: string;
        metadata?: Record<string, any>;
        context?: Record<string, any>;
        tags?: string[];
        status?: TransactionStatus;
        baseCurrency?: string;
        baseAmountMinor?: string;
        exchangeRate?: string;
    }): Promise<Transaction>;
    createPendingTransaction(payload: {
        tenantId: string;
        referenceType?: string;
        referenceId?: string;
        amountMinor: string;
        currency: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
        context?: Record<string, any>;
        tags?: string[];
    }): Promise<Transaction>;
    updateTransactionStatus(payload: {
        tenantId: string;
        transactionId: string;
        newStatus: TransactionStatus;
        referenceId?: string | null;
    }): Promise<void>;
    reverseTransaction(transactionId: string, tenantId: string, payload?: {
        metadata?: Record<string, any>;
    }): Promise<Transaction>;
    getAccountBalance(accountId: string, tenantId: string, currency?: string): Promise<string>;
    getAccountTransactions(accountId: string, tenantId: string): Promise<Transaction[]>;
}
