// src/wallet/wallet.service.ts

import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { LedgerService } from '../services/ledger.service';
import { EntryDto } from '../dto/entry.dto';
import { Direction } from '../entity/entry.entity';
import { Transaction, TransactionStatus } from '../entity/transaction.entity';
import { PaymentCallback } from '../common/types/gateway.payment.types';

@Injectable()
export class WalletService {

    constructor(
        private ledgerService: LedgerService,
    ) { }

    // --------------------------------------
    // Configurable System Accounts
    // --------------------------------------

    private PLATFORM_REVENUE_ACCOUNT_ID = 'uuid-revenue-acc';
    private TAX_LIABILITY_ACCOUNT_ID = 'uuid-tax-liability-acc';
    private EXTERNAL_CASH_ACCOUNT_ID = 'uuid-external-cash-acc';
    private ESCROW_HOLDING_ACCOUNT_ID = 'uuid-escrow-acc';

    // --------------------------------------
    // Utility Conversion
    // --------------------------------------

    private toMinor(amount: number): bigint {
        return BigInt(Math.round(amount * 100));
    }

    // --------------------------------------
    // P2P Transfer
    // --------------------------------------

    async sendP2PWithFeeAndVAT(
        senderAccountId: string,
        recipientAccountId: string,
        principalAmount: number,
        feeRate: number,
        vatRate: number,
        currency: string
    ) {

        const principalMinor = this.toMinor(principalAmount);

        const feeMinor = this.toMinor(principalAmount * feeRate);
        const vatMinor = BigInt(Math.round(Number(feeMinor) * vatRate));

        const totalDeduction = principalMinor + feeMinor + vatMinor;

        const balance = BigInt(
            await this.ledgerService.getAccountBalance(senderAccountId)
        );

        if (balance < totalDeduction) {
            throw new BadRequestException('Insufficient balance');
        }

        const entries: EntryDto[] = [
            {
                accountId: senderAccountId,
                direction: Direction.DEBIT,
                amountMinor: principalMinor.toString(),
                currency: currency,
                description: 'Principal transfer'
            },
            {
                accountId: senderAccountId,
                direction: Direction.DEBIT,
                amountMinor: feeMinor.toString(),
                currency: currency,
                description: 'Service fee'
            },
            {
                accountId: senderAccountId,
                direction: Direction.DEBIT,
                amountMinor: vatMinor.toString(),
                currency: currency,
                description: 'VAT'
            },

            {
                accountId: recipientAccountId,
                direction: Direction.CREDIT,
                amountMinor: principalMinor.toString(),
                currency: currency,
                description: 'P2P receipt'
            },

            {
                accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
                direction: Direction.CREDIT,
                amountMinor: feeMinor.toString(),
                currency: currency,
                description: 'Revenue'
            },

            {
                accountId: this.TAX_LIABILITY_ACCOUNT_ID,
                direction: Direction.CREDIT,
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
            type: 'P2P_TRANSFER'
        });
    }

    // --------------------------------------
    // Escrow Operations (Business Layer Only)
    // --------------------------------------

    async fundEscrow(
        buyerAccountId: string,
        amount: number,
        escrowRefId: string,
        currency: string
    ) {

        const minor = BigInt(Math.round(amount * 100));

        const entries: EntryDto[] = [
            {
                accountId: buyerAccountId,
                direction: Direction.DEBIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: `Escrow lock ${escrowRefId}`
            },
            {
                accountId: this.ESCROW_HOLDING_ACCOUNT_ID,
                direction: Direction.CREDIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: 'Escrow holding'
            }
        ];

        return this.ledgerService.createTransaction({
            entriesData: entries,
            metadata: { escrowRefId, event: 'ESCROW_LOCK' },
            type: 'ESCROW'
        });
    }

    async releaseEscrow(
        sellerAccountId: string,
        amount: number,
        escrowRefId: string,
        currency: string
    ) {

        const minor = BigInt(Math.round(amount * 100));

        const entries: EntryDto[] = [
            {
                accountId: this.ESCROW_HOLDING_ACCOUNT_ID,
                direction: Direction.DEBIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: 'Escrow release'
            },
            {
                accountId: sellerAccountId,
                direction: Direction.CREDIT,
                amountMinor: minor.toString(),
                currency: currency,
                description: 'Escrow payout'
            }
        ];

        return this.ledgerService.createTransaction({
            entriesData: entries,
            metadata: { escrowRefId, event: 'ESCROW_RELEASE' },
            type: 'ESCROW'
        });
    }

    // --------------------------------------
    // External Deposit Lifecycle
    // --------------------------------------

    async handleDeposit(payload: {
        userAccountId: string;
        grossAmount: number;
        paymentToken: string;
        paymentCallback: PaymentCallback;
        depositFeeRate: number;
        depositVatRate: number;
        currency: string
    }): Promise<Transaction> {

        const {
            userAccountId,
            grossAmount,
            paymentToken,
            paymentCallback,
            depositFeeRate,
            depositVatRate,
            currency
        } = payload;

        const serviceFee = grossAmount * depositFeeRate;
        const vatAmount = serviceFee * depositVatRate;
        const netDeposit = grossAmount - serviceFee - vatAmount;

        const pendingTransaction = await this.ledgerService.createPendingTransaction(
            'DEPOSIT',
            this.toMinor(grossAmount).toString(),
            currency,
            userAccountId,
        );

        try {

            const gatewayRefId = await paymentCallback({
                paymentMethodId: paymentToken,
                amount: netDeposit,
                transactionId: pendingTransaction.id,
            });

            await this.ledgerService.updateTransaction(
                pendingTransaction.id,
                { gatewayRefId }
            );

            return pendingTransaction;

        } catch {
            await this.ledgerService.updateTransaction(
                pendingTransaction.id,
                { status: TransactionStatus.FAILED }
            );

            throw new BadRequestException('Payment gateway charge failed.');
        }
    }

    async handleWithdrawal(payload: {
        userAccountId: string;
        netAmount: number;
        bankAccountId: string;
        paymentCallback: PaymentCallback;
        withdrawalFeeAmount: number;
        withdrawalVatAmount: number;
        currency: string
    }): Promise<Transaction> {

        const {
            userAccountId,
            netAmount,
            bankAccountId,
            paymentCallback,
            withdrawalFeeAmount,
            withdrawalVatAmount,
            currency
        } = payload;

        const serviceFee = withdrawalFeeAmount;
        const vatAmount = withdrawalVatAmount;
        const grossDeduction = netAmount + serviceFee + vatAmount;

        const balance = BigInt(
            await this.ledgerService.getAccountBalance(userAccountId)
        );

        if (balance < this.toMinor(grossDeduction)) {
            throw new BadRequestException('Insufficient wallet balance.');
        }

        const entries: EntryDto[] = [
            // User debit
            {
                accountId: userAccountId,
                direction: Direction.DEBIT,
                amountMinor: this.toMinor(grossDeduction).toString(),
                currency: currency,
                description: 'Withdrawal gross deduction'
            },

            // External payout clearing
            {
                accountId: this.EXTERNAL_CASH_ACCOUNT_ID,
                direction: Direction.CREDIT,
                amountMinor: this.toMinor(netAmount).toString(),
                currency: currency,
                description: 'Payout earmark'
            },

            // Revenue
            {
                accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
                direction: Direction.CREDIT,
                amountMinor: this.toMinor(serviceFee).toString(),
                currency: currency,
                description: 'Service fee revenue'
            },

            // VAT
            {
                accountId: this.TAX_LIABILITY_ACCOUNT_ID,
                direction: Direction.CREDIT,
                amountMinor: this.toMinor(vatAmount).toString(),
                currency: currency,
                description: 'VAT liability'
            }
        ];

        const transaction = await this.ledgerService.createTransaction({
            entriesData: entries,
            metadata: { event: 'WITHDRAWAL' },
            type: 'WITHDRAWAL'
        });

        try {

            const gatewayRefId = await paymentCallback({
                paymentMethodId: bankAccountId,
                amount: grossDeduction,
                transactionId: transaction.id
            });

            await this.ledgerService.updateTransaction(transaction.id, {
                gatewayRefId,
                status: TransactionStatus.PENDING
            });

            return transaction;

        } catch {

            await this.handleFailedWithdrawal(
                transaction,
                userAccountId,
                grossDeduction,
                serviceFee,
                withdrawalVatAmount,
                currency
            );

            throw new InternalServerErrorException('Payout failed.');
        }
    }

    private async handleFailedWithdrawal(
        originalTransaction: Transaction,
        userAccountId: string,
        grossAmount: number,
        serviceFee: number,
        vatAmount: number,
        currency: string
    ) {

        const netAmount = grossAmount - serviceFee - vatAmount;

        await this.ledgerService.updateTransaction(
            originalTransaction.id,
            { status: TransactionStatus.FAILED }
        );

        const reversalEntries: EntryDto[] = [

            // Reverse user debit → credit back full gross amount
            {
                accountId: userAccountId,
                direction: Direction.CREDIT,
                amountMinor: this.toMinor(grossAmount).toString(),
                currency: currency,
                description: 'Withdrawal reversal - user refund'
            },

            // Reverse external payout earmark
            {
                accountId: this.EXTERNAL_CASH_ACCOUNT_ID,
                direction: Direction.DEBIT,
                amountMinor: this.toMinor(netAmount).toString(),
                currency: currency,
                description: 'Withdrawal reversal - external cash correction'
            },

            // Reverse platform revenue
            {
                accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
                direction: Direction.DEBIT,
                amountMinor: this.toMinor(serviceFee).toString(),
                currency: currency,
                description: 'Withdrawal reversal - revenue rollback'
            },

            // Reverse VAT liability
            {
                accountId: this.TAX_LIABILITY_ACCOUNT_ID,
                direction: Direction.DEBIT,
                amountMinor: this.toMinor(vatAmount).toString(),
                currency: currency,
                description: 'Withdrawal reversal - VAT rollback'
            }
        ];


        return this.ledgerService.createTransaction({
            entriesData: reversalEntries,
            metadata: { event: 'WITHDRAWAL_REVERSAL' },
            type: 'WITHDRAWAL'
        });
    }

    async getWalletBalance(accountId: string): Promise<number> {
        const balance = await this.ledgerService.getAccountBalance(accountId);
        return Number(balance) / 100;
    }

    async getWalletTransactions(accountId: string): Promise<Transaction[]> {
        return this.ledgerService.getAccountTransactions(accountId);
    }
}