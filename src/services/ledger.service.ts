// src/ledger/ledger.service.ts
import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
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

    // -----------------------------
    // Core Posting Engine
    // -----------------------------

    async createTransaction(payload: {
        type: string;
        entriesData: EntryDto[];
        mainAccountId?: string;
        gatewayRefId?: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>
    },
    ): Promise<Transaction> {

        const { type, entriesData, gatewayRefId, idempotencyKey } = payload;

        // Validate double-entry rule
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

        return this.dataSource.transaction(async (manager) => {

            // Optional idempotency enforcement
            if (idempotencyKey) {
                const exists = await manager.getRepository(Transaction).findOne({
                    where: { idempotencyKey },
                });

                if (exists) return exists;
            }

            const transaction = manager.create(Transaction, {
                type,
                status: TransactionStatus.POSTED,
                gatewayRefId,
                idempotencyKey,
                amountMinor: totalDebit.toString(),
                currency: entriesData[0]?.currency,
            });

            await manager.save(transaction);

            for (const entryData of entriesData) {

                const entry = manager.create(Entry, {
                    tenantId: entryData.tenantId,
                    transactionId: transaction.id,
                    accountId: entryData.accountId,
                    direction: entryData.direction,
                    amountMinor: entryData.amountMinor,
                    currency: entryData.currency,
                    description: entryData.description,
                });

                await manager.save(entry);

                await this.updateAccountBalance(
                    manager,
                    entryData.accountId,
                    BigInt(entryData.amountMinor),
                    entryData.direction
                );
            }

            return transaction;
        });
    }

    // -----------------------------
    // Cached Balance Update
    // -----------------------------

    private async updateAccountBalance(
        manager: EntityManager,
        accountId: string,
        amount: bigint,
        direction: Direction,
    ): Promise<void> {

        const multiplier = direction === Direction.CREDIT ? 1n : -1n;
        const delta = amount * multiplier;

        const result = await manager
            .getRepository(Balance)
            .increment(
                { accountId },
                'amountMinor',
                delta.toString()
            );

        if (result.affected === 0) {
            throw new InternalServerErrorException(
                `Failed to update balance for account ${accountId}`
            );
        }
    }

    // -----------------------------
    // Pending Transaction Lifecycle
    // -----------------------------

    async createPendingTransaction(
        type: string,
        amountMinor: string,
        currency: string,
        mainAccountId: string,
    ): Promise<Transaction> {

        return this.dataSource.getRepository(Transaction).save({
            type,
            status: TransactionStatus.PENDING,
            amountMinor,
            mainAccountId,
            currency: currency,
        });
    }

    async updateTransaction(
        transactionId: string,
        data: Partial<Transaction>,
    ): Promise<void> {
        await this.dataSource.getRepository(Transaction).update(
            transactionId,
            data
        );
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