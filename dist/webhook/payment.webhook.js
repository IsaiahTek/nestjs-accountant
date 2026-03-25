"use strict";
// src/webhook/webhook.service.ts
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const common_1 = require("@nestjs/common");
const accountant_config_1 = require("../accountant.config");
const ledger_service_1 = require("../services/ledger.service");
const entry_entity_1 = require("../entity/entry.entity");
const transaction_entity_1 = require("../entity/transaction.entity");
let WebhookService = class WebhookService {
    constructor(ledgerService, moduleOptions = accountant_config_1.defaultAccountantModuleOptions) {
        this.ledgerService = ledgerService;
        this.moduleOptions = moduleOptions;
    }
    computeRateMinor(amountMinor, rate) {
        return BigInt(Math.round(Number(amountMinor) * rate));
    }
    /**
     * Finds the pending transaction and finalizes the deposit by creating ledger entries.
     */
    async finalizeDeposit(externalRefId, payloadData) {
        const pendingTransactionId = payloadData?.transactionId;
        const pendingTransaction = pendingTransactionId
            ? await this.ledgerService.findPendingTransactionById(pendingTransactionId)
            : await this.ledgerService.findPendingTransactionByRefId(externalRefId);
        if (!pendingTransaction.ownerId) {
            throw new common_1.BadRequestException(`Pending transaction ${pendingTransaction.id} has no owner account.`);
        }
        const grossMinor = BigInt(pendingTransaction.amountMinor);
        const feeRate = pendingTransaction.metadata?.depositFeeRate ?? this.moduleOptions.depositFeeRate;
        const vatRate = pendingTransaction.metadata?.depositVatRate ?? this.moduleOptions.depositVatRate;
        const feeMinor = this.computeRateMinor(grossMinor, feeRate);
        const vatMinor = this.computeRateMinor(feeMinor, vatRate);
        const netMinor = grossMinor - feeMinor - vatMinor;
        if (netMinor < 0n) {
            throw new common_1.BadRequestException('Invalid deposit fee configuration for webhook finalization.');
        }
        // 3. Create the Final Ledger Entries
        const entries = [
            // DEBIT: External Cash (Money came into the system's control)
            {
                tenantId: pendingTransaction.tenantId,
                accountId: this.moduleOptions.externalCashAccountId,
                direction: entry_entity_1.Direction.DEBIT,
                amountMinor: grossMinor.toString(),
                description: 'Deposit Gross Amount Received (Webhook)',
                currency: pendingTransaction.currency,
            },
            // CREDIT: User Wallet (Net amount added to user)
            {
                tenantId: pendingTransaction.tenantId,
                accountId: pendingTransaction.ownerId,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: netMinor.toString(),
                description: 'Net Deposit to Wallet (Webhook)',
                currency: pendingTransaction.currency,
            },
            // CREDIT: Platform Revenue (The service fee earned)
            {
                tenantId: pendingTransaction.tenantId,
                accountId: this.moduleOptions.platformRevenueAccountId,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: feeMinor.toString(),
                description: 'Platform Deposit Fee (Webhook)',
                currency: pendingTransaction.currency,
            },
            // CREDIT: Tax Liability (The tax collected on the fee)
            {
                tenantId: pendingTransaction.tenantId,
                accountId: this.moduleOptions.taxLiabilityAccountId,
                direction: entry_entity_1.Direction.CREDIT,
                amountMinor: vatMinor.toString(),
                description: 'VAT on Deposit Fee (Webhook)',
                currency: pendingTransaction.currency,
            },
        ];
        try {
            // 4. Atomically create entries and update status to SUCCESS
            const finalTransaction = await this.ledgerService.createTransaction({
                type: pendingTransaction.type ?? 'DEPOSIT',
                entriesData: entries,
                ownerAccountId: pendingTransaction.ownerId,
                gatewayRefId: externalRefId,
                tenantId: pendingTransaction.tenantId,
                idempotencyKey: `deposit-post:${pendingTransaction.id}`,
                metadata: {
                    event: 'DEPOSIT_POSTED_WEBHOOK',
                    pendingTransactionId: pendingTransaction.id,
                },
            });
            await this.ledgerService.updateTransactionStatus({
                tenantId: pendingTransaction.tenantId,
                transactionId: pendingTransaction.id,
                newStatus: transaction_entity_1.TransactionStatus.POSTED,
                gatewayRefId: externalRefId,
            });
            return finalTransaction;
        }
        catch (error) {
            console.error('Failed to create final ledger entries:', error);
            await this.ledgerService.updateTransactionStatus({
                tenantId: pendingTransaction.tenantId,
                transactionId: pendingTransaction.id,
                newStatus: transaction_entity_1.TransactionStatus.FAILED,
                gatewayRefId: externalRefId,
            });
            throw new common_1.InternalServerErrorException('Ledger finalization failed.');
        }
    }
};
exports.WebhookService = WebhookService;
exports.WebhookService = WebhookService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(accountant_config_1.ACCOUNTANT_MODULE_OPTIONS)),
    __metadata("design:paramtypes", [ledger_service_1.LedgerService, Object])
], WebhookService);
//# sourceMappingURL=payment.webhook.js.map