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

    async findPendingTransactionByRefId(externalRefId: string): Promise<Transaction> {
        const transaction = await this.dataSource.getRepository(Transaction).findOne({
            where: {
                gatewayRefId: externalRefId,
                status: TransactionStatus.PENDING,
            },
        });

        if (!transaction) {
            throw new NotFoundException(`Transaction with ref ${externalRefId} not found.`);
        }

        return transaction;
    }

    async findTransactionByRefId(externalRefId: string): Promise<Transaction> {
        const transaction = await this.dataSource.getRepository(Transaction).findOne({
            where: { gatewayRefId: externalRefId },
        });

        if (!transaction) {
            throw new NotFoundException(`Transaction with ref ${externalRefId} not found.`);
        }

        return transaction;
    }

    async findPendingTransactionById(transactionId: string): Promise<Transaction> {
        const transaction = await this.dataSource.getRepository(Transaction).findOne({
            where: {
                id: transactionId,
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
        tenantId?: string,
    ): Promise<void> {
        const repo = queryRunner.manager.getRepository(Balance);
        let balance = await repo.findOne({
            where: { accountId, currency },
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
                entry.direction === 'DEBIT'
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
        type: string;
        entriesData: EntryDto[];
        ownerAccountId?: string;
        gatewayRefId?: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
        tenantId?: string;
        status?: TransactionStatus;
    }): Promise<Transaction> {
        const { type, entriesData, gatewayRefId, idempotencyKey, metadata } = payload;

        if (!entriesData.length) {
            throw new BadRequestException('Transaction must include at least one entry.');
        }

        const currency = entriesData[0].currency;
        if (entriesData.some((entry) => entry.currency !== currency)) {
            throw new BadRequestException('All entries in a transaction must have the same currency.');
        }

        const tenantId = payload.tenantId ?? entriesData[0].tenantId;

        // -----------------------------
        // 1️⃣ Validate Double Entry
        // -----------------------------

        const totalDebit = entriesData
            .filter(e => e.direction === Direction.DEBIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);

        const totalCredit = entriesData
            .filter(e => e.direction === Direction.CREDIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);

        if (totalDebit !== totalCredit) {
            throw new BadRequestException(
                `Ledger entries are unbalanced. Debit=${totalDebit} Credit=${totalCredit}`
            );
        }

        const queryRunner = this.dataSource.createQueryRunner();

        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // -----------------------------
            // 2️⃣ Idempotency Enforcement
            // -----------------------------

            if (idempotencyKey) {
                const whereClause = tenantId === undefined
                    ? { idempotencyKey }
                    : { idempotencyKey, tenantId };
                const existing = await queryRunner.manager
                    .getRepository(Transaction)
                    .findOne({ where: whereClause });

                if (existing) {
                    await queryRunner.rollbackTransaction();
                    return existing;
                }
            }

            // -----------------------------
            // 3️⃣ Aggregate Account Deltas
            // -----------------------------

            const deltas = this.aggregateDeltas(entriesData);

            // -----------------------------
            // 4️⃣ Atomic Balance Enforcement
            // -----------------------------

            for (const [key, delta] of deltas.entries()) {
                const { accountId, currency: entryCurrency } = this.parseBalanceKey(key);
                await this.applyBalanceDelta(
                    queryRunner,
                    accountId,
                    entryCurrency,
                    delta,
                    tenantId,
                );
            }

            // -----------------------------
            // 5️⃣ Create Transaction Record
            // -----------------------------

            const transaction = queryRunner.manager.create(Transaction, {
                type,
                gatewayRefId,
                idempotencyKey,
                metadata,
                amountMinor: totalDebit.toString(),
                currency,
                ownerId: payload.ownerAccountId ?? null,
                tenantId,
                status: payload.status ?? TransactionStatus.POSTED,
            });

            await queryRunner.manager.save(transaction);

            // -----------------------------
            // 6️⃣ Insert Entries
            // -----------------------------

            for (const entryData of entriesData) {
                const entry = queryRunner.manager.create(Entry, {
                    tenantId: entryData.tenantId,
                    transactionId: transaction.id,
                    accountId: entryData.accountId,
                    direction: entryData.direction,
                    amountMinor: entryData.amountMinor,
                    currency: entryData.currency,
                    description: entryData.description,
                });

                await queryRunner.manager.save(entry);
            }

            await queryRunner.commitTransaction();
            return transaction;

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }


    // -----------------------------
    // Pending Transaction Lifecycle
    // -----------------------------

    async createPendingTransaction(
        payload: {
            tenantId?: string;
            type: string;
            amountMinor: string;
            currency: string;
            ownerAccountId: string;
            idempotencyKey?: string;
            metadata?: Record<string, any>;
            gatewayRefId?: string;
        }
    ): Promise<Transaction> {

        const {
            tenantId,
            type,
            amountMinor,
            currency,
            ownerAccountId,
            idempotencyKey,
            metadata,
            gatewayRefId,
        } = payload;

        return this.dataSource.transaction(async (manager) => {

            if (idempotencyKey) {
                const whereClause = tenantId === undefined
                    ? { idempotencyKey }
                    : { tenantId, idempotencyKey };
                const existing = await manager.findOne(Transaction, { where: whereClause });

                if (existing) return existing;
            }

            const tx = manager.create(Transaction, {
                tenantId,
                type,
                status: TransactionStatus.PENDING,
                amountMinor,
                currency,
                ownerId: ownerAccountId,
                idempotencyKey,
                metadata,
                gatewayRefId,
            });

            return manager.save(tx);
        });
    }

    async updateTransactionStatus({tenantId, transactionId, newStatus, gatewayRefId}: {
        tenantId?: string,
        transactionId: string,
        newStatus: TransactionStatus,
        gatewayRefId?: string | null
    }): Promise<void> {

        await this.dataSource.transaction(async (manager) => {

            const whereClause = tenantId === undefined
                ? { id: transactionId }
                : { id: transactionId, tenantId };

            const tx = await manager.findOne(Transaction, { where: whereClause });

            if (!tx) {
                throw new NotFoundException('Transaction not found');
            }

            // Lifecycle rules
            if (tx.status === newStatus) {
                tx.gatewayRefId = gatewayRefId ?? tx.gatewayRefId ?? null;
                await manager.save(tx);
                return;
            }

            if (tx.status === TransactionStatus.POSTED) {
                throw new BadRequestException('Posted transaction cannot be modified');
            }

            if (tx.status === TransactionStatus.REVERSED) {
                throw new BadRequestException('Reversed transaction cannot be modified');
            }

            tx.gatewayRefId = gatewayRefId ?? null;

            tx.status = newStatus;

            await manager.save(tx);
        });
    }

    async getAccountBalance(accountId: string, currency?: string): Promise<string> {
        const repo = this.dataSource.getRepository(Balance);
        const balance = currency
            ? await repo.findOneBy({ accountId, currency })
            : await repo.findOne({
                where: { accountId },
                order: { updatedAt: 'DESC' },
            });

        return balance?.amountMinor ?? '0';
    }

    async getAccountTransactions(accountId: string): Promise<Transaction[]> {
        return this.dataSource
            .getRepository(Transaction)
            .findBy({ ownerId: accountId });
    }
}
