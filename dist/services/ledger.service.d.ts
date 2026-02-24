import { DataSource } from 'typeorm';
import { Transaction, TransactionStatus } from '../entity/transaction.entity';
import { EntryDto } from '../dto/entry.dto';
export declare class LedgerService {
    private dataSource;
    constructor(dataSource: DataSource);
    findPendingTransactionByRefId(externalRefId: string): Promise<Transaction>;
    findTransactionByRefId(externalRefId: string): Promise<Transaction>;
    findPendingTransactionById(transactionId: string): Promise<Transaction>;
    private getBalanceKey;
    private parseBalanceKey;
    private applyBalanceDelta;
    private aggregateDeltas;
    createTransaction(payload: {
        type: string;
        entriesData: EntryDto[];
        ownerAccountId?: string;
        gatewayRefId?: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
        tenantId?: string;
        status?: TransactionStatus;
    }): Promise<Transaction>;
    createPendingTransaction(payload: {
        tenantId?: string;
        type: string;
        amountMinor: string;
        currency: string;
        ownerAccountId: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
        gatewayRefId?: string;
    }): Promise<Transaction>;
    updateTransactionStatus({ tenantId, transactionId, newStatus, gatewayRefId }: {
        tenantId?: string;
        transactionId: string;
        newStatus: TransactionStatus;
        gatewayRefId?: string | null;
    }): Promise<void>;
    getAccountBalance(accountId: string, currency?: string): Promise<string>;
    getAccountTransactions(accountId: string): Promise<Transaction[]>;
}
