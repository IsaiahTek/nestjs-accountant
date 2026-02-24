"use strict";
// src/wallet/wallet.service.ts
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
exports.WalletService = void 0;
const common_1 = require("@nestjs/common");
const ledger_service_1 = require("../services/ledger.service");
const entry_entity_1 = require("../entity/entry.entity");
const transaction_entity_1 = require("../entity/transaction.entity");
let WalletService = class WalletService {
    constructor(ledgerService) {
        this.ledgerService = ledgerService;
        // --------------------------------------
        // Configurable System Accounts
        // --------------------------------------
        this.PLATFORM_REVENUE_ACCOUNT_ID = 'uuid-revenue-acc';
        this.TAX_LIABILITY_ACCOUNT_ID = 'uuid-tax-liability-acc';
        this.EXTERNAL_CASH_ACCOUNT_ID = 'uuid-external-cash-acc';
        this.ESCROW_HOLDING_ACCOUNT_ID = 'uuid-escrow-acc';
    }
    // --------------------------------------
    // Utility Conversion
    // --------------------------------------
    toMinor(amount) {
        return BigInt(Math.round(amount * 100));
    }
    computeRateMinor(amountMinor, rate) {
        return BigInt(Math.round(Number(amountMinor) * rate));
    }
    // --------------------------------------
    // P2P Transfer
    // --------------------------------------
    async sendP2PWithFeeAndVAT(senderAccountId, recipientAccountId, principalAmount, feeRate, vatRate, currency) {
        const principalMinor = this.toMinor(principalAmount);
        const feeMinor = this.toMinor(principalAmount * feeRate);
        const vatMinor = BigInt(Math.round(Number(feeMinor) * vatRate));
        const totalDeduction = principalMinor + feeMinor + vatMinor;
        const balance = BigInt(await this.ledgerService.getAccountBalance(senderAccountId, currency));
        if (balance < totalDeduction) {
            throw new common_1.BadRequestException('Insufficient balance');
        }
        const entries = [
            {
                accountId: senderAccountId,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: principalMinor.toString(),
                currency: currency,
                description: 'Principal transfer'
            },
            {
                accountId: senderAccountId,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: feeMinor.toString(),
                currency: currency,
                description: 'Service fee'
            },
            {
                accountId: senderAccountId,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: vatMinor.toString(),
                currency: currency,
                description: 'VAT'
            },
            {
                accountId: recipientAccountId,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: principalMinor.toString(),
                currency: currency,
                description: 'P2P receipt'
            },
            {
                accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: feeMinor.toString(),
                currency: currency,
                description: 'Revenue'
            },
            {
                accountId: this.TAX_LIABILITY_ACCOUNT_ID,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: vatMinor.toString(),
                currency: currency,
                description: 'VAT liability'
            }
        ];
        return this.ledgerService.createTransaction({
            entriesData: entries,
            metadata: {
                event: 'P2P_TRANSFER'
            },
            type: 'P2P_TRANSFER',
            ownerAccountId: senderAccountId,
        });
    }
    // --------------------------------------
    // Escrow Operations (Business Layer Only)
    // --------------------------------------
    async fundEscrow(buyerAccountId, amount, escrowRefId, currency) {
        const minor = BigInt(Math.round(amount * 100));
        const entries = [
            {
                accountId: buyerAccountId,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: `Escrow lock ${escrowRefId}`
            },
            {
                accountId: this.ESCROW_HOLDING_ACCOUNT_ID,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: 'Escrow holding'
            }
        ];
        return this.ledgerService.createTransaction({
            entriesData: entries,
            metadata: { escrowRefId, event: 'ESCROW_LOCK' },
            type: 'ESCROW',
            ownerAccountId: buyerAccountId,
        });
    }
    async releaseEscrow(sellerAccountId, amount, escrowRefId, currency) {
        const minor = BigInt(Math.round(amount * 100));
        const entries = [
            {
                accountId: this.ESCROW_HOLDING_ACCOUNT_ID,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: 'Escrow release'
            },
            {
                accountId: sellerAccountId,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: 'Escrow payout'
            }
        ];
        return this.ledgerService.createTransaction({
            entriesData: entries,
            metadata: { escrowRefId, event: 'ESCROW_RELEASE' },
            type: 'ESCROW',
            ownerAccountId: sellerAccountId,
        });
    }
    // --------------------------------------
    // External Deposit Lifecycle
    // --------------------------------------
    async handleDeposit(payload) {
        const { userAccountId, grossAmount, paymentToken, paymentCallback, depositFeeRate, depositVatRate, currency, tenantId, idempotencyKey, metadata, type } = payload;
        const grossMinor = this.toMinor(grossAmount);
        const feeMinor = this.computeRateMinor(grossMinor, depositFeeRate);
        const vatMinor = this.computeRateMinor(feeMinor, depositVatRate);
        const netMinor = grossMinor - feeMinor - vatMinor;
        if (netMinor < 0n) {
            throw new common_1.BadRequestException('Deposit configuration produced a negative net amount.');
        }
        const pendingTransaction = await this.ledgerService.createPendingTransaction({
            tenantId,
            type: type ?? 'DEPOSIT',
            amountMinor: grossMinor.toString(),
            currency: currency,
            ownerAccountId: userAccountId,
            idempotencyKey: idempotencyKey,
            metadata: {
                ...metadata,
                depositFeeRate,
                depositVatRate,
            },
        });
        try {
            const gatewayRefId = await paymentCallback({
                paymentMethodId: paymentToken,
                amount: grossAmount,
                transactionId: pendingTransaction.id,
            });
            const postedTransaction = await this.ledgerService.createTransaction({
                type: type ?? 'DEPOSIT',
                ownerAccountId: userAccountId,
                gatewayRefId,
                tenantId,
                idempotencyKey: `deposit-post:${pendingTransaction.id}`,
                metadata: {
                    ...metadata,
                    event: 'DEPOSIT_POSTED',
                    pendingTransactionId: pendingTransaction.id,
                },
                entriesData: [
                    {
                        tenantId,
                        accountId: this.EXTERNAL_CASH_ACCOUNT_ID,
                        direction: entry_entity_1.Direction.DEBIT,
                        amountMinor: grossMinor.toString(),
                        currency,
                        description: 'Deposit gross amount received',
                    },
                    {
                        tenantId,
                        accountId: userAccountId,
                        direction: entry_entity_1.Direction.CREDIT,
                        amountMinor: netMinor.toString(),
                        currency,
                        description: 'Net deposit to wallet',
                    },
                    {
                        tenantId,
                        accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
                        direction: entry_entity_1.Direction.CREDIT,
                        amountMinor: feeMinor.toString(),
                        currency,
                        description: 'Deposit service fee',
                    },
                    {
                        tenantId,
                        accountId: this.TAX_LIABILITY_ACCOUNT_ID,
                        direction: entry_entity_1.Direction.CREDIT,
                        amountMinor: vatMinor.toString(),
                        currency,
                        description: 'Deposit fee VAT',
                    },
                ],
            });
            await this.ledgerService.updateTransactionStatus({
                tenantId,
                transactionId: pendingTransaction.id,
                newStatus: transaction_entity_1.TransactionStatus.POSTED,
                gatewayRefId: gatewayRefId
            });
            return postedTransaction;
        }
        catch (error) {
            await this.ledgerService.updateTransactionStatus({
                tenantId,
                transactionId: pendingTransaction.id,
                newStatus: transaction_entity_1.TransactionStatus.FAILED,
                gatewayRefId: null
            });
            throw new common_1.BadRequestException('Payment gateway charge failed.');
        }
    }
    async handleWithdrawal(payload) {
        const { userAccountId, netAmount, bankAccountId, paymentCallback, withdrawalFeeAmount, withdrawalVatAmount, currency, tenantId, idempotencyKey, metadata, } = payload;
        const serviceFee = withdrawalFeeAmount;
        const vatAmount = withdrawalVatAmount;
        const grossDeduction = netAmount + serviceFee + vatAmount;
        const balance = BigInt(await this.ledgerService.getAccountBalance(userAccountId, currency));
        if (balance < this.toMinor(grossDeduction)) {
            throw new common_1.BadRequestException('Insufficient wallet balance.');
        }
        const entries = [
            // User debit
            {
                tenantId,
                accountId: userAccountId,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: this.toMinor(grossDeduction).toString(),
                currency: currency,
                description: 'Withdrawal gross deduction'
            },
            // External payout clearing
            {
                tenantId,
                accountId: this.EXTERNAL_CASH_ACCOUNT_ID,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: this.toMinor(netAmount).toString(),
                currency: currency,
                description: 'Payout earmark'
            },
            // Revenue
            {
                tenantId,
                accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: this.toMinor(serviceFee).toString(),
                currency: currency,
                description: 'Service fee revenue'
            },
            // VAT
            {
                tenantId,
                accountId: this.TAX_LIABILITY_ACCOUNT_ID,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: this.toMinor(vatAmount).toString(),
                currency: currency,
                description: 'VAT liability'
            }
        ];
        const transaction = await this.ledgerService.createTransaction({
            entriesData: entries,
            metadata: {
                ...metadata,
                event: 'WITHDRAWAL',
                netAmountMinor: this.toMinor(netAmount).toString(),
                serviceFeeMinor: this.toMinor(serviceFee).toString(),
                vatAmountMinor: this.toMinor(vatAmount).toString(),
            },
            type: 'WITHDRAWAL',
            ownerAccountId: userAccountId,
            status: transaction_entity_1.TransactionStatus.PENDING,
            tenantId,
            idempotencyKey,
        });
        if (transaction.status === transaction_entity_1.TransactionStatus.POSTED) {
            return transaction;
        }
        if (transaction.status === transaction_entity_1.TransactionStatus.FAILED) {
            throw new common_1.BadRequestException('Withdrawal request has already failed.');
        }
        try {
            const gatewayRefId = await paymentCallback({
                paymentMethodId: bankAccountId,
                amount: netAmount,
                transactionId: transaction.id
            });
            await this.ledgerService.updateTransactionStatus({
                tenantId: transaction.tenantId,
                transactionId: transaction.id,
                newStatus: transaction_entity_1.TransactionStatus.POSTED,
                gatewayRefId: gatewayRefId
            });
            return transaction;
        }
        catch (error) {
            await this.handleFailedWithdrawal(transaction, userAccountId, grossDeduction, serviceFee, withdrawalVatAmount, currency, tenantId);
            throw new common_1.InternalServerErrorException('Payout failed.');
        }
    }
    async handleFailedWithdrawal(originalTransaction, userAccountId, grossAmount, serviceFee, vatAmount, currency, tenantId) {
        const netAmount = grossAmount - serviceFee - vatAmount;
        await this.ledgerService.updateTransactionStatus({
            tenantId: originalTransaction.tenantId,
            transactionId: originalTransaction.id,
            newStatus: transaction_entity_1.TransactionStatus.FAILED,
            gatewayRefId: null
        });
        const reversalEntries = [
            // Reverse user debit → credit back full gross amount
            {
                tenantId,
                accountId: userAccountId,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: this.toMinor(grossAmount).toString(),
                currency: currency,
                description: 'Withdrawal reversal - user refund'
            },
            // Reverse external payout earmark
            {
                tenantId,
                accountId: this.EXTERNAL_CASH_ACCOUNT_ID,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: this.toMinor(netAmount).toString(),
                currency: currency,
                description: 'Withdrawal reversal - external cash correction'
            },
            // Reverse platform revenue
            {
                tenantId,
                accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: this.toMinor(serviceFee).toString(),
                currency: currency,
                description: 'Withdrawal reversal - revenue rollback'
            },
            // Reverse VAT liability
            {
                tenantId,
                accountId: this.TAX_LIABILITY_ACCOUNT_ID,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: this.toMinor(vatAmount).toString(),
                currency: currency,
                description: 'Withdrawal reversal - VAT rollback'
            }
        ];
        return this.ledgerService.createTransaction({
            entriesData: reversalEntries,
            metadata: {
                event: 'WITHDRAWAL_REVERSAL',
                reversedTransactionId: originalTransaction.id,
            },
            type: 'WITHDRAWAL',
            ownerAccountId: userAccountId,
            tenantId,
            idempotencyKey: `withdrawal-reversal:${originalTransaction.id}`,
        });
    }
    async getWalletBalance(accountId) {
        const balance = await this.ledgerService.getAccountBalance(accountId);
        return Number(balance) / 100;
    }
    async getWalletTransactions(accountId) {
        return this.ledgerService.getAccountTransactions(accountId);
    }
};
exports.WalletService = WalletService;
exports.WalletService = WalletService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ledger_service_1.LedgerService])
], WalletService);
//# sourceMappingURL=wallet.service.js.map