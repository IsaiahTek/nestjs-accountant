// src/ledger/ledger.service.ts
import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { Transaction, TransactionStatus } from '../entity/transaction.entity';
import { Entry, Direction } from '../entity/entry.entity';
import { EntryDto } from '../dto/entry.dto';
import { Balance } from '../entity/balance.entity';
import { Account } from '../entity/account.entity';

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

    async applyBalanceDelta(
        queryRunner: QueryRunner,
        accountId: string,
        deltaMinor: string, // signed bigint string
    ): Promise<void> {
        const result = await queryRunner.manager
            .createQueryBuilder()
            .update(Account)
            .set({
                balanceMinor: () => `"balance_minor" + :delta`,
            })
            .where(`id = :accountId`)
            .andWhere(`
        allow_negative = true
        OR "balance_minor" + :delta >= - "overdraft_limit_minor"
      `)
            .setParameters({
                delta: deltaMinor,
                accountId,
            })
            .execute();

        if (result.affected === 0) {
            throw new Error('Insufficient funds or overdraft limit exceeded');
        }
    }

    private aggregateDeltas(entries: EntryDto[]): Map<string, bigint> {
        const map = new Map<string, bigint>();

        for (const entry of entries) {
            const current = map.get(entry.accountId) ?? 0n;
            const delta =
                entry.direction === 'DEBIT'
                    ? -BigInt(entry.amountMinor)
                    : BigInt(entry.amountMinor);

            map.set(entry.accountId, current + delta);
        }

        return map;
    }

    // -----------------------------
    // Core Posting Engine
    // -----------------------------

    async createTransaction(payload: {
        type: string;
        entriesData: EntryDto[];
        mainAccountId?: string;
        gatewayRefId?: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
    }): Promise<Transaction> {
        const { type, entriesData, gatewayRefId, idempotencyKey, metadata } = payload;

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
                const existing = await queryRunner.manager
                    .getRepository(Transaction)
                    .findOne({ where: { idempotencyKey } });

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

            for (const [accountId, delta] of deltas.entries()) {
                await this.applyBalanceDelta(
                    queryRunner,
                    accountId,
                    delta.toString()
                );
            }

            // -----------------------------
            // 5️⃣ Create Transaction Record
            // -----------------------------

            const transaction = queryRunner.manager.create(Transaction, {
                type,
                status: TransactionStatus.POSTED,
                gatewayRefId,
                idempotencyKey,
                metadata,
                amountMinor: totalDebit.toString(),
                currency: entriesData[0]?.currency,
                mainAccountId: payload.mainAccountId,
                tenantId: entriesData[0]?.tenantId,
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
            tenantId: string;
            type: string;
            amountMinor: string;
            currency: string;
            mainAccountId: string;
            idempotencyKey?: string;
            metadata?: Record<string, any>;
        }
    ): Promise<Transaction> {

        const {
            tenantId,
            type,
            amountMinor,
            currency,
            mainAccountId,
            idempotencyKey,
            metadata,
        } = payload;

        return this.dataSource.transaction(async (manager) => {

            if (idempotencyKey) {
                const existing = await manager.findOne(Transaction, {
                    where: { tenantId, idempotencyKey },
                });

                if (existing) return existing;
            }

            const tx = manager.create(Transaction, {
                tenantId,
                type,
                status: TransactionStatus.PENDING,
                amountMinor,
                currency,
                mainAccountId,
                idempotencyKey,
                metadata,
            });

            return manager.save(tx);
        });
    }

    async updateTransactionStatus({tenantId, transactionId, newStatus, gatewayRefId}: {
        tenantId: string,
        transactionId: string,
        newStatus: TransactionStatus,
        gatewayRefId: string
    }): Promise<void> {

        await this.dataSource.transaction(async (manager) => {

            const tx = await manager.findOne(Transaction, {
                where: { id: transactionId, tenantId },
            });

            if (!tx) {
                throw new NotFoundException('Transaction not found');
            }

            // Lifecycle rules
            if (tx.status === TransactionStatus.POSTED) {
                throw new BadRequestException('Posted transaction cannot be modified');
            }

            if (tx.status === TransactionStatus.REVERSED) {
                throw new BadRequestException('Reversed transaction cannot be modified');
            }

            tx.gatewayRefId = gatewayRefId; // Ensure it's null if undefined

            tx.status = newStatus;

            await manager.save(tx);
        });
    }

    async getAccountBalance(accountId: string): Promise<string> {
        const balance = await this.dataSource
            .getRepository(Balance)
            .findOneBy({ accountId });

        return balance?.amountMinor ?? '0';
    }

    async getAccountTransactions(accountId: string): Promise<Transaction[]> {
        return this.dataSource
            .getRepository(Transaction)
            .findBy({ ownerId: accountId });
    }
}