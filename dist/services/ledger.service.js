"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerService = void 0;
// src/ledger/ledger.service.ts
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const transaction_entity_1 = require("../entity/transaction.entity");
const entry_entity_1 = require("../entity/entry.entity");
const balance_entity_1 = require("../entity/balance.entity");
const account_entity_1 = require("../entity/account.entity");
let LedgerService = class LedgerService {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    // -----------------------------
    // Account Management
    // -----------------------------
    async createAccount(payload) {
        const repo = this.dataSource.getRepository(account_entity_1.Account);
        const account = repo.create(payload);
        return repo.save(account);
    }
    async findAccountById(accountId, tenantId) {
        const account = await this.dataSource.getRepository(account_entity_1.Account).findOne({
            where: { id: accountId, tenantId },
        });
        if (!account) {
            throw new common_1.NotFoundException(`Account ${accountId} not found for tenant ${tenantId}`);
        }
        return account;
    }
    async findAccountByReference(referenceId, referenceType, tenantId) {
        const account = await this.dataSource.getRepository(account_entity_1.Account).findOne({
            where: { referenceId, referenceType, tenantId },
        });
        if (!account) {
            throw new common_1.NotFoundException(`Account for ${referenceType}:${referenceId} not found`);
        }
        return account;
    }
    // -----------------------------
    // Query Helpers
    // -----------------------------
    async findPendingTransactionByReference(referenceId, referenceType, tenantId) {
        const transaction = await this.dataSource.getRepository(transaction_entity_1.Transaction).findOne({
            where: { tenantId, referenceId, referenceType, status: transaction_entity_1.TransactionStatus.PENDING },
        });
        if (!transaction) {
            throw new common_1.NotFoundException(`Pending transaction with ref ${referenceType}:${referenceId} not found.`);
        }
        return transaction;
    }
    async findTransactionByReference(referenceId, referenceType, tenantId) {
        const transaction = await this.dataSource.getRepository(transaction_entity_1.Transaction).findOne({
            where: { tenantId, referenceId, referenceType },
        });
        if (!transaction) {
            throw new common_1.NotFoundException(`Transaction with ref ${referenceType}:${referenceId} not found.`);
        }
        return transaction;
    }
    async findPendingTransactionById(transactionId, tenantId) {
        const transaction = await this.dataSource.getRepository(transaction_entity_1.Transaction).findOne({
            where: {
                id: transactionId,
                tenantId,
                status: transaction_entity_1.TransactionStatus.PENDING,
            },
        });
        if (!transaction) {
            throw new common_1.NotFoundException(`Pending transaction with id ${transactionId} not found.`);
        }
        return transaction;
    }
    getBalanceKey(accountId, currency) {
        return `${accountId}::${currency}`;
    }
    parseBalanceKey(key) {
        const [accountId, currency] = key.split('::');
        return { accountId, currency };
    }
    async applyBalanceDelta(queryRunner, accountId, currency, deltaMinor, tenantId) {
        const repo = queryRunner.manager.getRepository(balance_entity_1.Balance);
        // 🔥 Pessimistic locking is already applied in createTransaction via sorted keys
        let balance = await repo.findOne({
            where: { tenantId, accountId, currency },
            lock: { mode: 'pessimistic_write' },
        });
        if (!balance) {
            if (deltaMinor < 0n) {
                throw new common_1.BadRequestException(`Insufficient funds in account ${accountId}`);
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
            throw new common_1.BadRequestException(`Insufficient funds in account ${accountId}`);
        }
        balance.amountMinor = nextAmount.toString();
        await repo.save(balance);
    }
    aggregateDeltas(entries) {
        const map = new Map();
        for (const entry of entries) {
            const key = this.getBalanceKey(entry.accountId, entry.currency);
            const current = map.get(key) ?? 0n;
            const delta = entry.direction === entry_entity_1.Direction.DEBIT
                ? -BigInt(entry.amountMinor)
                : BigInt(entry.amountMinor);
            map.set(key, current + delta);
        }
        return map;
    }
    // -----------------------------
    // Core Posting Engine
    // -----------------------------
    async createTransaction(payload) {
        const { tenantId, entriesData, idempotencyKey, metadata, context, tags, referenceId, referenceType, baseCurrency, baseAmountMinor, exchangeRate } = payload;
        if (!entriesData.length) {
            throw new common_1.BadRequestException('Transaction must include at least one entry.');
        }
        // 1. Validate Currency Consistency
        const currency = entriesData[0].currency;
        if (entriesData.some((entry) => entry.currency !== currency)) {
            throw new common_1.BadRequestException('All entries in a single transaction must have the same currency.');
        }
        // 2. Validate Double Entry Integrity
        const totalDebit = entriesData
            .filter(e => e.direction === entry_entity_1.Direction.DEBIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);
        const totalCredit = entriesData
            .filter(e => e.direction === entry_entity_1.Direction.CREDIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);
        if (totalDebit !== totalCredit) {
            throw new common_1.BadRequestException(`Unbalanced transaction: Debit Sum (${totalDebit}) != Credit Sum (${totalCredit})`);
        }
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            // 3. Idempotency Check
            if (idempotencyKey) {
                const existing = await queryRunner.manager
                    .getRepository(transaction_entity_1.Transaction)
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
                const delta = deltasMap.get(key);
                const { accountId, currency: entryCurrency } = this.parseBalanceKey(key);
                await this.applyBalanceDelta(queryRunner, accountId, entryCurrency, delta, tenantId);
            }
            // 6. Create Transaction Record
            const transaction = queryRunner.manager.create(transaction_entity_1.Transaction, {
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
                baseAmountMinor: baseAmountMinor?.toString(),
                exchangeRate: exchangeRate?.toString(),
                status: payload.status ?? transaction_entity_1.TransactionStatus.POSTED,
            });
            await queryRunner.manager.save(transaction);
            // 7. Insert Entries
            const entries = entriesData.map(data => queryRunner.manager.create(entry_entity_1.Entry, {
                tenantId: data.tenantId ?? tenantId,
                transactionId: transaction.id,
                accountId: data.accountId,
                direction: data.direction,
                amountMinor: data.amountMinor.toString(),
                currency: data.currency,
                description: data.description,
                baseCurrency: data.baseCurrency ?? baseCurrency,
                baseAmountMinor: (data.baseAmountMinor ?? (data.currency === baseCurrency ? data.amountMinor : undefined))?.toString(),
                exchangeRate: (data.exchangeRate ?? exchangeRate)?.toString(),
            }));
            await queryRunner.manager.save(entry_entity_1.Entry, entries);
            await queryRunner.commitTransaction();
            return transaction;
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }
    async createPendingTransaction(payload) {
        const { tenantId, referenceType, referenceId, amountMinor, currency, idempotencyKey, metadata, context, tags } = payload;
        return this.dataSource.transaction(async (manager) => {
            if (idempotencyKey) {
                const existing = await manager.findOne(transaction_entity_1.Transaction, { where: { tenantId, idempotencyKey } });
                if (existing)
                    return existing;
            }
            const tx = manager.create(transaction_entity_1.Transaction, {
                tenantId,
                referenceType,
                referenceId,
                status: transaction_entity_1.TransactionStatus.PENDING,
                amountMinor: amountMinor.toString(),
                currency,
                idempotencyKey,
                metadata: metadata ?? {},
                context: context ?? {},
                tags: tags ?? [],
            });
            return manager.save(tx);
        });
    }
    async updateTransactionStatus(payload) {
        const { tenantId, transactionId, newStatus, referenceId } = payload;
        await this.dataSource.transaction(async (manager) => {
            const tx = await manager.findOne(transaction_entity_1.Transaction, { where: { id: transactionId, tenantId } });
            if (!tx) {
                throw new common_1.NotFoundException(`Transaction ${transactionId} not found for tenant ${tenantId}`);
            }
            if (tx.status === newStatus)
                return;
            if (tx.status === transaction_entity_1.TransactionStatus.POSTED || tx.status === transaction_entity_1.TransactionStatus.REVERSED) {
                throw new common_1.BadRequestException(`Immutable transaction state: ${tx.status}`);
            }
            tx.status = newStatus;
            if (referenceId !== undefined)
                tx.referenceId = referenceId;
            await manager.save(tx);
        });
    }
    async reverseTransaction(transactionId, tenantId, payload) {
        return this.dataSource.transaction(async (manager) => {
            const originalTx = await manager.findOne(transaction_entity_1.Transaction, {
                where: { id: transactionId, tenantId, status: transaction_entity_1.TransactionStatus.POSTED }
            });
            if (!originalTx) {
                throw new common_1.NotFoundException(`Posted transaction ${transactionId} not found for tenant ${tenantId}.`);
            }
            const entries = await manager.find(entry_entity_1.Entry, { where: { tenantId, transactionId } });
            const reversalEntries = entries.map(e => ({
                tenantId: e.tenantId,
                accountId: e.accountId,
                direction: e.direction === entry_entity_1.Direction.DEBIT ? entry_entity_1.Direction.CREDIT : entry_entity_1.Direction.DEBIT,
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
                status: transaction_entity_1.TransactionStatus.POSTED,
                metadata: {
                    ...payload?.metadata,
                    reversedTransactionId: transactionId,
                },
            });
            originalTx.status = transaction_entity_1.TransactionStatus.REVERSED;
            originalTx.reversalOf = reversalTx.id;
            await manager.save(originalTx);
            return reversalTx;
        });
    }
    async getAccountBalance(accountId, tenantId, currency) {
        const balance = await this.dataSource.getRepository(balance_entity_1.Balance).findOne({
            where: { tenantId, accountId, ...(currency ? { currency } : {}) },
            order: { updatedAt: 'DESC' },
        });
        return balance?.amountMinor ?? '0';
    }
    async getAccountTransactions(accountId, tenantId) {
        // Since ownerId is removed, we should find transactions by looking at entries for this account
        const entries = await this.dataSource.getRepository(entry_entity_1.Entry).find({
            where: { tenantId, accountId },
            relations: ['transaction'],
        });
        // This is a bit inefficient, but more correct since a transaction can involve many accounts.
        // It's better to query for transactions that have an entry for this accountId.
        const txIds = [...new Set(entries.map(e => e.transactionId))];
        if (txIds.length === 0)
            return [];
        return this.dataSource.getRepository(transaction_entity_1.Transaction).createQueryBuilder('tx')
            .where('tx.id IN (:...txIds)', { txIds })
            .andWhere('tx.tenantId = :tenantId', { tenantId })
            .orderBy('tx.createdAt', 'DESC')
            .getMany();
    }
};
exports.LedgerService = LedgerService;
exports.LedgerService = LedgerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], LedgerService);
//# sourceMappingURL=ledger.service.js.map