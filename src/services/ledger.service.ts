// src/ledger/ledger.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Transaction, TransactionStatus } from '../entity/transaction.entity';
import { Entry, Direction } from '../entity/entry.entity';
import { EntryDto } from '../dto/entry.dto';
import { Balance } from '../entity/balance.entity';

@Injectable()
export class LedgerService {
    constructor(private dataSource: DataSource) { }

    // -----------------------------
    // Query Helpers
    // -----------------------------

    async findPendingTransactionByReference(referenceId: string, referenceType: string, tenantId: string): Promise<Transaction> {
        const transaction = await this.dataSource.getRepository(Transaction).findOne({
            where: { tenantId, referenceId, referenceType, status: TransactionStatus.PENDING },
        });

        if (!transaction) {
            throw new NotFoundException(`Pending transaction with ref ${referenceType}:${referenceId} not found.`);
        }

        return transaction;
    }

    async findTransactionByReference(referenceId: string, referenceType: string, tenantId: string): Promise<Transaction> {
        const transaction = await this.dataSource.getRepository(Transaction).findOne({
            where: { tenantId, referenceId, referenceType },
        });

        if (!transaction) {
            throw new NotFoundException(`Transaction with ref ${referenceType}:${referenceId} not found.`);
        }

        return transaction;
    }

    async findPendingTransactionById(transactionId: string, tenantId: string): Promise<Transaction> {
        const transaction = await this.dataSource.getRepository(Transaction).findOne({
            where: {
                id: transactionId,
                tenantId,
                status: TransactionStatus.PENDING,
            },
        });

        if (!transaction) {
            throw new NotFoundException(`Pending transaction with id ${transactionId} not found.`);
        }

        return transaction;
    }

    private getBalanceKey(accountId: string, currency: string): string {
        return `${accountId}::${currency}`;
    }

    private parseBalanceKey(key: string): { accountId: string; currency: string } {
        const [accountId, currency] = key.split('::');
        return { accountId, currency };
    }

    private async applyBalanceDelta(
        queryRunner: QueryRunner,
        accountId: string,
        currency: string,
        deltaMinor: bigint,
        tenantId: string,
    ): Promise<void> {
        const repo = queryRunner.manager.getRepository(Balance);

        // 🔥 Pessimistic locking is already applied in createTransaction via sorted keys
        let balance = await repo.findOne({
            where: { tenantId, accountId, currency },
            lock: { mode: 'pessimistic_write' },
        });

        if (!balance) {
            if (deltaMinor < 0n) {
                throw new BadRequestException(`Insufficient funds in account ${accountId}`);
            }

            balance = repo.create({
                tenantId,
                accountId,
                currency,
                amountMinor: '0',
            });
        }

        const nextAmount = BigInt(balance.amountMinor) + deltaMinor;
        if (nextAmount < 0n) {
            throw new BadRequestException(`Insufficient funds in account ${accountId}`);
        }

        balance.amountMinor = nextAmount.toString();
        await repo.save(balance);
    }

    private aggregateDeltas(entries: EntryDto[]): Map<string, bigint> {
        const map = new Map<string, bigint>();

        for (const entry of entries) {
            const key = this.getBalanceKey(entry.accountId, entry.currency);
            const current = map.get(key) ?? 0n;
            const delta =
                entry.direction === Direction.DEBIT
                    ? -BigInt(entry.amountMinor)
                    : BigInt(entry.amountMinor);

            map.set(key, current + delta);
        }

        return map;
    }

    // -----------------------------
    // Core Posting Engine
    // -----------------------------

    async createTransaction(payload: {
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
    }): Promise<Transaction> {
        const { tenantId, entriesData, idempotencyKey, metadata, context, tags, referenceId, referenceType, baseCurrency, baseAmountMinor, exchangeRate } = payload;

        if (!entriesData.length) {
            throw new BadRequestException('Transaction must include at least one entry.');
        }

        // 1. Validate Currency Consistency
        const currency = entriesData[0].currency;
        if (entriesData.some((entry) => entry.currency !== currency)) {
            throw new BadRequestException('All entries in a single transaction must have the same currency.');
        }

        // 2. Validate Double Entry Integrity
        const totalDebit = entriesData
            .filter(e => e.direction === Direction.DEBIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);

        const totalCredit = entriesData
            .filter(e => e.direction === Direction.CREDIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);

        if (totalDebit !== totalCredit) {
            throw new BadRequestException(
                `Unbalanced transaction: Debit Sum (${totalDebit}) != Credit Sum (${totalCredit})`
            );
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 3. Idempotency Check
            if (idempotencyKey) {
                const existing = await queryRunner.manager
                    .getRepository(Transaction)
                    .findOne({ where: { tenantId, idempotencyKey } });

                if (existing) {
                    await queryRunner.rollbackTransaction();
                    return existing;
                }
            }

            // 4. Aggregate Deltas & Sort for Deadlock Prevention
            const deltasMap = this.aggregateDeltas(entriesData);
            const sortedKeys = Array.from(deltasMap.keys()).sort();

            // 5. Atomic Balance Updates with Pessimistic Locking
            for (const key of sortedKeys) {
                const delta = deltasMap.get(key)!;
                const { accountId, currency: entryCurrency } = this.parseBalanceKey(key);
                await this.applyBalanceDelta(
                    queryRunner,
                    accountId,
                    entryCurrency,
                    delta,
                    tenantId,
                );
            }

            // 6. Create Transaction Record
            const transaction = queryRunner.manager.create(Transaction, {
                tenantId,
                referenceType,
                referenceId,
                idempotencyKey,
                metadata: metadata ?? {},
                context: context ?? {},
                tags: tags ?? [],
                amountMinor: totalDebit.toString(),
                currency,
                baseCurrency,
                baseAmountMinor,
                exchangeRate,
                status: payload.status ?? TransactionStatus.POSTED,
            });

            await queryRunner.manager.save(transaction);

            // 7. Insert Entries
            const entries = entriesData.map(data => queryRunner.manager.create(Entry, {
                tenantId: data.tenantId ?? tenantId,
                transactionId: transaction.id,
                accountId: data.accountId,
                direction: data.direction,
                amountMinor: data.amountMinor,
                currency: data.currency,
                description: data.description,
                baseCurrency: data.baseCurrency ?? baseCurrency,
                baseAmountMinor: data.baseAmountMinor ?? (data.currency === baseCurrency ? data.amountMinor : undefined),
                exchangeRate: data.exchangeRate ?? exchangeRate,
            }));

            await queryRunner.manager.save(Entry, entries);

            await queryRunner.commitTransaction();
            return transaction;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async createPendingTransaction(payload: {
        tenantId: string;
        referenceType?: string;
        referenceId?: string;
        amountMinor: string;
        currency: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
        context?: Record<string, any>;
        tags?: string[];
    }): Promise<Transaction> {
        const { tenantId, referenceType, referenceId, amountMinor, currency, idempotencyKey, metadata, context, tags } = payload;

        return this.dataSource.transaction(async (manager) => {
            if (idempotencyKey) {
                const existing = await manager.findOne(Transaction, { where: { tenantId, idempotencyKey } });
                if (existing) return existing;
            }

            const tx = manager.create(Transaction, {
                tenantId,
                referenceType,
                referenceId,
                status: TransactionStatus.PENDING,
                amountMinor,
                currency,
                idempotencyKey,
                metadata: metadata ?? {},
                context: context ?? {},
                tags: tags ?? [],
            });

            return manager.save(tx);
        });
    }

    async updateTransactionStatus(payload: {
        tenantId: string;
        transactionId: string;
        newStatus: TransactionStatus;
        referenceId?: string | null;
    }): Promise<void> {
        const { tenantId, transactionId, newStatus, referenceId } = payload;

        await this.dataSource.transaction(async (manager) => {
            const tx = await manager.findOne(Transaction, { where: { id: transactionId, tenantId } });

            if (!tx) {
                throw new NotFoundException(`Transaction ${transactionId} not found for tenant ${tenantId}`);
            }

            if (tx.status === newStatus) return;

            if (tx.status === TransactionStatus.POSTED || tx.status === TransactionStatus.REVERSED) {
                throw new BadRequestException(`Immutable transaction state: ${tx.status}`);
            }

            tx.status = newStatus;
            if (referenceId !== undefined) tx.referenceId = referenceId;

            await manager.save(tx);
        });
    }

    async reverseTransaction(transactionId: string, tenantId: string, payload?: { metadata?: Record<string, any> }): Promise<Transaction> {
        return this.dataSource.transaction(async (manager) => {
            const originalTx = await manager.findOne(Transaction, {
                where: { id: transactionId, tenantId, status: TransactionStatus.POSTED }
            });

            if (!originalTx) {
                throw new NotFoundException(`Posted transaction ${transactionId} not found for tenant ${tenantId}.`);
            }

            const entries = await manager.find(Entry, { where: { tenantId, transactionId } });

            const reversalEntries: EntryDto[] = entries.map(e => ({
                tenantId: e.tenantId,
                accountId: e.accountId,
                direction: e.direction === Direction.DEBIT ? Direction.CREDIT : Direction.DEBIT,
                amountMinor: e.amountMinor,
                currency: e.currency,
                description: `Reversal of txn ${transactionId}`,
                baseCurrency: e.baseCurrency,
                baseAmountMinor: e.baseAmountMinor,
                exchangeRate: e.exchangeRate,
            }));

            const reversalTx = await this.createTransaction({
                tenantId,
                referenceType: 'REVERSAL',
                referenceId: transactionId,
                entriesData: reversalEntries,
                status: TransactionStatus.POSTED,
                metadata: {
                    ...payload?.metadata,
                    reversedTransactionId: transactionId,
                },
            });

            originalTx.status = TransactionStatus.REVERSED;
            originalTx.reversalOf = reversalTx.id;
            await manager.save(originalTx);

            return reversalTx;
        });
    }

    async getAccountBalance(accountId: string, tenantId: string, currency?: string): Promise<string> {
        const balance = await this.dataSource.getRepository(Balance).findOne({
            where: { tenantId, accountId, ...(currency ? { currency } : {}) },
            order: { updatedAt: 'DESC' },
        });

        return balance?.amountMinor ?? '0';
    }

    async getAccountTransactions(accountId: string, tenantId: string): Promise<Transaction[]> {
        // Since ownerId is removed, we should find transactions by looking at entries for this account
        const entries = await this.dataSource.getRepository(Entry).find({
            where: { tenantId, accountId },
            relations: ['transaction'],
        });

        // This is a bit inefficient, but more correct since a transaction can involve many accounts.
        // It's better to query for transactions that have an entry for this accountId.
        const txIds = [...new Set(entries.map(e => e.transactionId))];
        if (txIds.length === 0) return [];

        return this.dataSource.getRepository(Transaction).createQueryBuilder('tx')
            .where('tx.id IN (:...txIds)', { txIds })
            .andWhere('tx.tenantId = :tenantId', { tenantId })
            .orderBy('tx.createdAt', 'DESC')
            .getMany();
    }
}
