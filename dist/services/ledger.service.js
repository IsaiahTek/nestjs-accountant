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
let LedgerService = class LedgerService {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    // -----------------------------
    // Query Helpers
    // -----------------------------
    async findPendingTransactionByRefId(externalRefId) {
        const transaction = await this.dataSource.getRepository(transaction_entity_1.Transaction).findOne({
            where: {
                gatewayRefId: externalRefId,
                status: transaction_entity_1.TransactionStatus.PENDING,
            },
        });
        if (!transaction) {
            throw new common_1.NotFoundException(`Transaction with ref ${externalRefId} not found.`);
        }
        return transaction;
    }
    async findTransactionByRefId(externalRefId) {
        const transaction = await this.dataSource.getRepository(transaction_entity_1.Transaction).findOne({
            where: { gatewayRefId: externalRefId },
        });
        if (!transaction) {
            throw new common_1.NotFoundException(`Transaction with ref ${externalRefId} not found.`);
        }
        return transaction;
    }
    async findPendingTransactionById(transactionId) {
        const transaction = await this.dataSource.getRepository(transaction_entity_1.Transaction).findOne({
            where: {
                id: transactionId,
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
        let balance = await repo.findOne({
            where: { accountId, currency },
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
            const delta = entry.direction === 'DEBIT'
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
        const { type, entriesData, gatewayRefId, idempotencyKey, metadata } = payload;
        if (!entriesData.length) {
            throw new common_1.BadRequestException('Transaction must include at least one entry.');
        }
        const currency = entriesData[0].currency;
        if (entriesData.some((entry) => entry.currency !== currency)) {
            throw new common_1.BadRequestException('All entries in a transaction must have the same currency.');
        }
        const tenantId = payload.tenantId ?? entriesData[0].tenantId;
        // -----------------------------
        // 1️⃣ Validate Double Entry
        // -----------------------------
        const totalDebit = entriesData
            .filter(e => e.direction === entry_entity_1.Direction.DEBIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);
        const totalCredit = entriesData
            .filter(e => e.direction === entry_entity_1.Direction.CREDIT)
            .reduce((s, e) => s + BigInt(e.amountMinor), 0n);
        if (totalDebit !== totalCredit) {
            throw new common_1.BadRequestException(`Ledger entries are unbalanced. Debit=${totalDebit} Credit=${totalCredit}`);
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
                    .getRepository(transaction_entity_1.Transaction)
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
                await this.applyBalanceDelta(queryRunner, accountId, entryCurrency, delta, tenantId);
            }
            // -----------------------------
            // 5️⃣ Create Transaction Record
            // -----------------------------
            const transaction = queryRunner.manager.create(transaction_entity_1.Transaction, {
                type,
                gatewayRefId,
                idempotencyKey,
                metadata,
                amountMinor: totalDebit.toString(),
                currency,
                ownerId: payload.ownerAccountId ?? null,
                tenantId,
                status: payload.status ?? transaction_entity_1.TransactionStatus.POSTED,
            });
            await queryRunner.manager.save(transaction);
            // -----------------------------
            // 6️⃣ Insert Entries
            // -----------------------------
            for (const entryData of entriesData) {
                const entry = queryRunner.manager.create(entry_entity_1.Entry, {
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
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }
    // -----------------------------
    // Pending Transaction Lifecycle
    // -----------------------------
    async createPendingTransaction(payload) {
        const { tenantId, type, amountMinor, currency, ownerAccountId, idempotencyKey, metadata, gatewayRefId, } = payload;
        return this.dataSource.transaction(async (manager) => {
            if (idempotencyKey) {
                const whereClause = tenantId === undefined
                    ? { idempotencyKey }
                    : { tenantId, idempotencyKey };
                const existing = await manager.findOne(transaction_entity_1.Transaction, { where: whereClause });
                if (existing)
                    return existing;
            }
            const tx = manager.create(transaction_entity_1.Transaction, {
                tenantId,
                type,
                status: transaction_entity_1.TransactionStatus.PENDING,
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
    async updateTransactionStatus({ tenantId, transactionId, newStatus, gatewayRefId }) {
        await this.dataSource.transaction(async (manager) => {
            const whereClause = tenantId === undefined
                ? { id: transactionId }
                : { id: transactionId, tenantId };
            const tx = await manager.findOne(transaction_entity_1.Transaction, { where: whereClause });
            if (!tx) {
                throw new common_1.NotFoundException('Transaction not found');
            }
            // Lifecycle rules
            if (tx.status === newStatus) {
                tx.gatewayRefId = gatewayRefId ?? tx.gatewayRefId ?? null;
                await manager.save(tx);
                return;
            }
            if (tx.status === transaction_entity_1.TransactionStatus.POSTED) {
                throw new common_1.BadRequestException('Posted transaction cannot be modified');
            }
            if (tx.status === transaction_entity_1.TransactionStatus.REVERSED) {
                throw new common_1.BadRequestException('Reversed transaction cannot be modified');
            }
            tx.gatewayRefId = gatewayRefId ?? null;
            tx.status = newStatus;
            await manager.save(tx);
        });
    }
    async getAccountBalance(accountId, currency) {
        const repo = this.dataSource.getRepository(balance_entity_1.Balance);
        const balance = currency
            ? await repo.findOneBy({ accountId, currency })
            : await repo.findOne({
                where: { accountId },
                order: { updatedAt: 'DESC' },
            });
        return balance?.amountMinor ?? '0';
    }
    async getAccountTransactions(accountId) {
        return this.dataSource
            .getRepository(transaction_entity_1.Transaction)
            .findBy({ ownerId: accountId });
    }
};
exports.LedgerService = LedgerService;
exports.LedgerService = LedgerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], LedgerService);
//# sourceMappingURL=ledger.service.js.map