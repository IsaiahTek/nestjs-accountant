// const entries: EntryDto[] = [
//     // DEBIT: External Cash (Money came into the system's control)
//     { accountId: this.EXTERNAL_CASH_ACCOUNT_ID, direction: Direction.DEBIT, amount: grossAmount, description: 'Deposit Gross Amount Received' },
//     // CREDIT: User Wallet (Net amount added to user)
//     { accountId: userAccountId, direction: Direction.CREDIT, amount: netDeposit, description: 'Net Deposit to Wallet' },
//     // CREDIT: Platform Revenue (The service fee earned)
//     { accountId: this.PLATFORM_REVENUE_ACCOUNT_ID, direction: Direction.CREDIT, amount: serviceFee, description: 'Platform Deposit Fee' },
//     // CREDIT: Tax Liability (The tax collected on the fee)
//     { accountId: this.TAX_LIABILITY_ACCOUNT_ID, direction: Direction.CREDIT, amount: vatAmount, description: 'VAT on Deposit Fee' },
//   ];

// src/webhook/webhook.service.ts

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LedgerService } from '../services/ledger.service';
import { EntryDto } from '../dto/entry.dto';
import { Direction } from '../entity/entry.entity';
import { Transaction, TransactionStatus, TransactionType } from '../entity/transaction.entity';

@Injectable()
export class WebhookService {
  private PLATFORM_REVENUE_ACCOUNT_ID = 'uuid-revenue-acc';
  private TAX_LIABILITY_ACCOUNT_ID = 'uuid-tax-liability-acc';
  private EXTERNAL_CASH_ACCOUNT_ID = 'uuid-external-cash-acc';

  // Constants must match what was used in the WalletService/Business Logic
  private DEPOSIT_FEE_RATE = 0.02; // 2%
  private DEPOSIT_VAT_RATE = 0.15; // 15%

  constructor(private ledgerService: LedgerService) {}

  /**
   * Finds the pending transaction and finalizes the deposit by creating ledger entries.
   */
  async finalizeDeposit(externalRefId: string, payloadData: any): Promise<Transaction> {
    
    // 1. Reconciliation: Find the PENDING Transaction using the External ID
    // Assumes LedgerService has a method to find the transaction by gatewayRefId
    const pendingTransaction = await this.ledgerService.findPendingTransactionByRefId(externalRefId);
    
    if (!pendingTransaction) {
      // Handle scenario where transaction is not found or already processed
      console.warn(`Transaction with ref ${externalRefId} not found or finalized.`);
      return; 
    }

    // 2. Determine Amounts (The key step!)
    // The amount MUST be derived from the ORIGINAL business intent (the pending transaction)
    // NOT from the webhook payload, as the PG might use a different currency/format.
    const grossAmount = pendingTransaction.amount;
    const userAccountId = pendingTransaction.mainAccountId; // Stored when pending transaction was created

    // Re-calculate the exact fee split used by the business logic
    const serviceFee = grossAmount * this.DEPOSIT_FEE_RATE;
    const vatAmount = serviceFee * this.DEPOSIT_VAT_RATE;
    const netDeposit = grossAmount - serviceFee - vatAmount;

    // 3. Create the Final Ledger Entries
    const entries: EntryDto[] = [
      // DEBIT: External Cash (Money came into the system's control)
      { accountId: this.EXTERNAL_CASH_ACCOUNT_ID, direction: Direction.DEBIT, amount: grossAmount, description: 'Deposit Gross Amount Received (Webhook)' },
      // CREDIT: User Wallet (Net amount added to user)
      { accountId: userAccountId, direction: Direction.CREDIT, amount: netDeposit, description: 'Net Deposit to Wallet (Webhook)' },
      // CREDIT: Platform Revenue (The service fee earned)
      { accountId: this.PLATFORM_REVENUE_ACCOUNT_ID, direction: Direction.CREDIT, amount: serviceFee, description: 'Platform Deposit Fee (Webhook)' },
      // CREDIT: Tax Liability (The tax collected on the fee)
      { accountId: this.TAX_LIABILITY_ACCOUNT_ID, direction: Direction.CREDIT, amount: vatAmount, description: 'VAT on Deposit Fee (Webhook)' },
    ];

    try {
        // 4. Atomically create entries and update status to SUCCESS
        const finalTransaction = await this.ledgerService.createTransaction({
            type: TransactionType.DEPOSIT,
            entriesData: entries,
            mainAccountId: userAccountId, // mainAccountId
            gatewayRefId: externalRefId // gatewayRefId
        });
        
        // Mark the original PENDING transaction as REVERSED/COMPLETED, 
        // or simply mark the new final transaction as SUCCESS and delete the pending one (if your architecture allows).
        // A common pattern is to just update the PENDING transaction's status to SUCCESS:
        await this.ledgerService.updateTransaction(
            pendingTransaction.id, 
            { status: TransactionStatus.SUCCESS }
        );

        return finalTransaction;
    } catch (error) {
      console.error('Failed to create final ledger entries:', error);
      // Critical: Alert operations team if reconciliation failed.
      await this.ledgerService.updateTransaction(
        pendingTransaction.id, 
        { status: TransactionStatus.FAILED }
    );
      throw new InternalServerErrorException('Ledger finalization failed.');
    }
  }
}