// src/webhook/webhook.service.ts

import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { LedgerService } from '../services/ledger.service';
import { EntryDto } from '../dto/entry.dto';
import { Direction } from '../entity/entry.entity';
import { Transaction, TransactionStatus } from '../entity/transaction.entity';

@Injectable()
export class WebhookService {
  private PLATFORM_REVENUE_ACCOUNT_ID = 'uuid-revenue-acc';
  private TAX_LIABILITY_ACCOUNT_ID = 'uuid-tax-liability-acc';
  private EXTERNAL_CASH_ACCOUNT_ID = 'uuid-external-cash-acc';

  // Constants must match what was used in the WalletService/Business Logic
  private DEPOSIT_FEE_RATE = 0.02; // 2%
  private DEPOSIT_VAT_RATE = 0.15; // 15%

  constructor(private ledgerService: LedgerService) {}

  private computeRateMinor(amountMinor: bigint, rate: number): bigint {
    return BigInt(Math.round(Number(amountMinor) * rate));
  }

  /**
   * Finds the pending transaction and finalizes the deposit by creating ledger entries.
   */
  async finalizeDeposit(externalRefId: string, payloadData: any): Promise<Transaction> {
    const pendingTransactionId = payloadData?.transactionId as string | undefined;

    const pendingTransaction = pendingTransactionId
      ? await this.ledgerService.findPendingTransactionById(pendingTransactionId)
      : await this.ledgerService.findPendingTransactionByRefId(externalRefId);

    if (!pendingTransaction.ownerId) {
      throw new BadRequestException(`Pending transaction ${pendingTransaction.id} has no owner account.`);
    }

    const grossMinor = BigInt(pendingTransaction.amountMinor);
    const feeRate = pendingTransaction.metadata?.depositFeeRate ?? this.DEPOSIT_FEE_RATE;
    const vatRate = pendingTransaction.metadata?.depositVatRate ?? this.DEPOSIT_VAT_RATE;
    const feeMinor = this.computeRateMinor(grossMinor, feeRate);
    const vatMinor = this.computeRateMinor(feeMinor, vatRate);
    const netMinor = grossMinor - feeMinor - vatMinor;

    if (netMinor < 0n) {
      throw new BadRequestException('Invalid deposit fee configuration for webhook finalization.');
    }

    // 3. Create the Final Ledger Entries
    const entries: EntryDto[] = [
      // DEBIT: External Cash (Money came into the system's control)
      {
        tenantId: pendingTransaction.tenantId,
        accountId: this.EXTERNAL_CASH_ACCOUNT_ID,
        direction: Direction.DEBIT,
        amountMinor: grossMinor.toString(),
        description: 'Deposit Gross Amount Received (Webhook)',
        currency: pendingTransaction.currency,
      },
      // CREDIT: User Wallet (Net amount added to user)
      {
        tenantId: pendingTransaction.tenantId,
        accountId: pendingTransaction.ownerId,
        direction: Direction.CREDIT,
        amountMinor: netMinor.toString(),
        description: 'Net Deposit to Wallet (Webhook)',
        currency: pendingTransaction.currency,
      },
      // CREDIT: Platform Revenue (The service fee earned)
      {
        tenantId: pendingTransaction.tenantId,
        accountId: this.PLATFORM_REVENUE_ACCOUNT_ID,
        direction: Direction.CREDIT,
        amountMinor: feeMinor.toString(),
        description: 'Platform Deposit Fee (Webhook)',
        currency: pendingTransaction.currency,
      },
      // CREDIT: Tax Liability (The tax collected on the fee)
      {
        tenantId: pendingTransaction.tenantId,
        accountId: this.TAX_LIABILITY_ACCOUNT_ID,
        direction: Direction.CREDIT,
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
        newStatus: TransactionStatus.POSTED,
        gatewayRefId: externalRefId,
      });

      return finalTransaction;
    } catch (error) {
      console.error('Failed to create final ledger entries:', error);
      await this.ledgerService.updateTransactionStatus({
        tenantId: pendingTransaction.tenantId,
        transactionId: pendingTransaction.id,
        newStatus: TransactionStatus.FAILED,
        gatewayRefId: externalRefId,
      });
      throw new InternalServerErrorException('Ledger finalization failed.');
    }
  }
}
