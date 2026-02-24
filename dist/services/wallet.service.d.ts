import { LedgerService } from '../services/ledger.service';
import { Transaction } from '../entity/transaction.entity';
import { PaymentCallback } from '../common/types/gateway.payment.types';
export declare class WalletService {
    private ledgerService;
    constructor(ledgerService: LedgerService);
    private PLATFORM_REVENUE_ACCOUNT_ID;
    private TAX_LIABILITY_ACCOUNT_ID;
    private EXTERNAL_CASH_ACCOUNT_ID;
    private ESCROW_HOLDING_ACCOUNT_ID;
    private toMinor;
    private computeRateMinor;
    sendP2PWithFeeAndVAT(senderAccountId: string, recipientAccountId: string, principalAmount: number, feeRate: number, vatRate: number, currency: string): Promise<Transaction>;
    fundEscrow(buyerAccountId: string, amount: number, escrowRefId: string, currency: string): Promise<Transaction>;
    releaseEscrow(sellerAccountId: string, amount: number, escrowRefId: string, currency: string): Promise<Transaction>;
    handleDeposit(payload: {
        userAccountId: string;
        grossAmount: number;
        paymentToken: string;
        paymentCallback: PaymentCallback;
        depositFeeRate: number;
        depositVatRate: number;
        currency: string;
        tenantId?: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
        type?: string;
    }): Promise<Transaction>;
    handleWithdrawal(payload: {
        userAccountId: string;
        netAmount: number;
        bankAccountId: string;
        paymentCallback: PaymentCallback;
        withdrawalFeeAmount: number;
        withdrawalVatAmount: number;
        currency: string;
        tenantId?: string;
        idempotencyKey?: string;
        metadata?: Record<string, any>;
    }): Promise<Transaction>;
    private handleFailedWithdrawal;
    getWalletBalance(accountId: string): Promise<number>;
    getWalletTransactions(accountId: string): Promise<Transaction[]>;
}
