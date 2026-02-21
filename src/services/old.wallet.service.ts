// // src/wallet/wallet.service.ts

// import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
// import { LedgerService } from '../services/ledger.service';
// import { EntryDto } from '../dto/entry.dto';
// import { Direction } from '../entity/entry.entity';
// import { Transaction, TransactionStatus } from '../entity/transaction.entity';
// import { PaymentCallback } from '../common/types/gateway.payment.types';

// @Injectable()
// export class WalletService {
//   // Hardcoded System Account IDs (These must exist in your database)
//   private PLATFORM_REVENUE_ACCOUNT_ID = 'uuid-revenue-acc';
//   private TAX_LIABILITY_ACCOUNT_ID = 'uuid-tax-liability-acc';
//   private EXTERNAL_CASH_ACCOUNT_ID = 'uuid-external-cash-acc';
//   private ESCROW_HOLDING_ACCOUNT_ID = 'uuid-escrow-acc';

//   constructor(
//     private ledgerService: LedgerService,
//   ) { }

//   // --- 1. INTERNAL: P2P Transfer (Atomic and Synchronous) ---

//   async sendP2PWithFeeAndVAT(
//     senderAccountId: string,
//     recipientAccountId: string,
//     principalAmount: number,
//     feeRate: number, // Generic input
//     vatRate: number // Generic input
//   ): Promise<Transaction> {

//     const serviceFee = principalAmount * feeRate;
//     const vatAmount = serviceFee * vatRate;
//     const totalDeduction = principalAmount + serviceFee + vatAmount;

//     // 1. Balance Check
//     const currentBalance = await this.ledgerService.getAccountBalance(senderAccountId);
//     if (currentBalance < totalDeduction) {
//       throw new BadRequestException('Insufficient wallet balance to cover transfer and fees.');
//     }

//     // 2. Construct the Entry DTOs: 3 DEBITS and 3 CREDITS
//     const entries: EntryDto[] = [
//       // DEBITS (Sender)
//       { accountId: senderAccountId, direction: Direction.DEBIT, amount: principalAmount, description: 'P2P Principal Transfer' },
//       { accountId: senderAccountId, direction: Direction.DEBIT, amount: serviceFee, description: 'Service Fee (Net)' },
//       { accountId: senderAccountId, direction: Direction.DEBIT, amount: vatAmount, description: 'Service Fee VAT Collected' },

//       // CREDITS (Recipient, Revenue, Tax)
//       { accountId: recipientAccountId, direction: Direction.CREDIT, amount: principalAmount, description: 'P2P Principal Received' },
//       { accountId: this.PLATFORM_REVENUE_ACCOUNT_ID, direction: Direction.CREDIT, amount: serviceFee, description: 'Platform Net Revenue' },
//       { accountId: this.TAX_LIABILITY_ACCOUNT_ID, direction: Direction.CREDIT, amount: vatAmount, description: 'VAT Liability' },
//     ];

//     // 3. Execute the atomic transaction
//     return this.ledgerService.createTransaction({
//       type: TransactionType.P2P_TRANSFER,
//       entriesData: entries,
//       mainAccountId: senderAccountId  
//     }
//     );
//   }

//   // INTERNAL : Escrow

//   async fundEscrow(buyerAccountId: string, amount: number, escrowRefId: string): Promise<Transaction> {

//     // 1. Balance Check (ensuring buyer has funds)
//     const currentBalance = await this.ledgerService.getAccountBalance(buyerAccountId);
//     if (currentBalance < amount) {
//       throw new BadRequestException('Insufficient balance to fund escrow.');
//     }

//     // 2. Define Entries: Lock the funds
//     const entries: EntryDto[] = [
//       // DEBIT: Buyer's Wallet (Funds leave the buyer's control)
//       { accountId: buyerAccountId, direction: Direction.DEBIT, amount: amount, description: `Escrow lock for reference ${escrowRefId}` },
//       // CREDIT: Escrow Holding Account (Funds are now managed by the system)
//       { accountId: this.ESCROW_HOLDING_ACCOUNT_ID, direction: Direction.CREDIT, amount: amount, description: `Funds received for ${escrowRefId}` },
//     ];

//     // 3. Execute atomic transaction
//     return this.ledgerService.createTransaction({
//       type: TransactionType.ESCROW_DEPOSIT, // Requires new enum type
//       entriesData: entries,
//       mainAccountId: buyerAccountId // mainAccountId: the initiator
//     });
//   }

//   // WalletService (Conceptual)

//   async releaseEscrow(sellerAccountId: string, amount: number, escrowRefId: string): Promise<Transaction> {

//     // 1. Define Entries: Release the funds
//     const entries: EntryDto[] = [
//       // DEBIT: Escrow Holding Account (Funds leave system control)
//       { accountId: this.ESCROW_HOLDING_ACCOUNT_ID, direction: Direction.DEBIT, amount: amount, description: `Escrow release for ${escrowRefId}` },
//       // CREDIT: Seller's Wallet (Funds are delivered)
//       { accountId: sellerAccountId, direction: Direction.CREDIT, amount: amount, description: `Payment received from escrow ${escrowRefId}` },
//     ];

//     // 2. Execute atomic transaction (fees can be included here or done in a separate call)
//     return this.ledgerService.createTransaction({
//       type: TransactionType.ESCROW_RELEASE, // Requires new enum type
//       entriesData: entries,
//       mainAccountId: sellerAccountId // mainAccountId: the recipient
//     });
//   }

//   // --- 2. EXTERNAL: Deposit (Asynchronous via Webhook) ---

//   async handleDeposit(payload: {
//     userAccountId: string,
//     grossAmount: number, // Renamed for clarity
//     paymentToken: string,
//     paymentCallback: PaymentCallback,
//     /**
//      * @depositFeeRate is the rate at which the deposit fee is calculated. Pass in 0 if no fee should be charged
//     */
//     depositFeeRate: number,
//     /**
//       * @depositVatRate is the rate at which the deposit VAT is calculated. Pass in 0 if no VAT should be charged
//       */
//     depositVatRate: number,
//   }): Promise<Transaction> {

//     const {
//       userAccountId,
//       grossAmount,
//       paymentToken,
//       paymentCallback,
//       depositFeeRate,
//       depositVatRate,
//     } = payload;

//     const serviceFee = grossAmount * depositFeeRate;
//     const vatAmount = serviceFee * depositVatRate;
//     const netDeposit = grossAmount - serviceFee - vatAmount;

//     // 1. Initiate: Create PENDING Transaction (using Gross Amount)
//     const pendingTransaction = await this.ledgerService.createPendingTransaction(
//       TransactionType.DEPOSIT,
//       grossAmount,
//       userAccountId
//     );

//     try {
//       // 2. External Call: Use generic callback
//       const gatewayRefId = await paymentCallback({
//         paymentMethodId: paymentToken,
//         amount: netDeposit,
//         transactionId: pendingTransaction.id,
//       });

//       // 3. Update Ref: Update PENDING transaction with the PG ID
//       await this.ledgerService.updateTransaction(
//         pendingTransaction.id,
//         { gatewayRefId: gatewayRefId }
//       );

//       return pendingTransaction;

//     } catch (error) {
//       // 4. Failure: Mark transaction as FAILED immediately
//       await this.ledgerService.updateTransaction(
//         pendingTransaction.id,
//         { status: TransactionStatus.FAILED }
//       );
//       throw new BadRequestException('Payment gateway charge failed.');
//     }
//   }

//   // --- 3. EXTERNAL: Withdrawal (Atomic Debit followed by Async Payout) ---

//   async handleWithdrawal(payload: {
//     userAccountId: string,
//     netAmount: number, // Net amount the user requested
//     bankAccountId: string,
//     paymentCallback: PaymentCallback,
//     withdrawalFeeAmount: number,
//     withdrawalVatAmount: number
//   }): Promise<Transaction> {
//     const { userAccountId, netAmount, bankAccountId, paymentCallback, withdrawalFeeAmount, withdrawalVatAmount } = payload
//     const serviceFee = withdrawalFeeAmount;
//     const vatAmount = withdrawalVatAmount;
//     const grossDeduction = netAmount + serviceFee + vatAmount; // Total deducted from user

//     // 1. Balance Check
//     const currentBalance = await this.ledgerService.getAccountBalance(userAccountId);
//     if (currentBalance < grossDeduction) {
//       throw new BadRequestException('Insufficient wallet balance to cover withdrawal and fees.');
//     }

//     // 2. Define Entries: DEBIT user for GROSS, CREDIT cash/revenue for NET
//     const entries: EntryDto[] = [
//       // DEBIT: User Wallet (Deduct the total gross amount)
//       { accountId: userAccountId, direction: Direction.DEBIT, amount: grossDeduction, description: 'Gross Withdrawal Request' },

//       // CREDIT: External Cash (Net amount sent to user)
//       { accountId: this.EXTERNAL_CASH_ACCOUNT_ID, direction: Direction.CREDIT, amount: netAmount, description: 'External Payout Earmarked (Net)' },

//       // CREDIT: Platform Revenue (Fee Collection)
//       { accountId: this.PLATFORM_REVENUE_ACCOUNT_ID, direction: Direction.CREDIT, amount: serviceFee, description: 'Withdrawal Service Fee (Net)' },

//       // CREDIT: Tax Liability (VAT Collection)
//       { accountId: this.TAX_LIABILITY_ACCOUNT_ID, direction: Direction.CREDIT, amount: vatAmount, description: 'VAT on Withdrawal Fee' },
//     ];

//     // 3. Atomic Execution: Move funds internally 
//     const transaction = await this.ledgerService.createTransaction({
//       type: TransactionType.WITHDRAWAL,
//       entriesData: entries,
//       mainAccountId: userAccountId
//     });

//     try {
//       // 4. External Call: Initiate payout via PG
//       const gatewayRefId = await paymentCallback({
//         paymentMethodId: bankAccountId,
//         amount: grossDeduction,
//         transactionId: transaction.id
//       });

//       // 5. Update Ref and Status: Mark as PENDING until confirmed by bank/PG
//       await this.ledgerService.updateTransaction(
//         transaction.id,
//         { gatewayRefId: gatewayRefId, status: TransactionStatus.PENDING }
//       );

//       return transaction;

//     } catch (error) {
//       // 6. CRITICAL Reversal: If PG fails immediately, reverse the internal debit.
//       await this.handleFailedWithdrawal(transaction, userAccountId, grossDeduction, serviceFee, withdrawalVatAmount);
//       throw new InternalServerErrorException('Payout failed, funds reversed to wallet.');
//     }
//   }

//   // --- 4. Helper for Withdrawal Reversals ---

//   // src/wallet/wallet.service.ts (Corrected handleFailedWithdrawal)

//   private async handleFailedWithdrawal(
//     originalTransaction: Transaction,
//     userAccountId: string,
//     grossAmount: number, // The full amount deducted from the user
//     serviceFee: number,
//     vatAmount: number
//   ) {

//     const netAmount = grossAmount - serviceFee - vatAmount;

//     // ---------------------------------------------------------------------

//     // 1. Mark original transaction as FAILED (Correct)
//     await this.ledgerService.updateTransaction(
//       originalTransaction.id,
//       { status: TransactionStatus.FAILED }
//     );

//     // 2. Define Reversal Entries (4 entries to perfectly undo the original 4)
//     const reversalEntries: EntryDto[] = [
//       // 1. UNDO DEBIT User Wallet -> CREDIT User Wallet
//       { accountId: userAccountId, direction: Direction.CREDIT, amount: grossAmount, description: 'Withdrawal Reversal: Funds returned to user' },

//       // 2. UNDO CREDIT External Cash -> DEBIT External Cash (Only the net amount)
//       { accountId: this.EXTERNAL_CASH_ACCOUNT_ID, direction: Direction.DEBIT, amount: netAmount, description: 'Withdrawal Reversal: Remove Net Payout earmark' },

//       // 3. UNDO CREDIT Platform Revenue -> DEBIT Platform Revenue (Remove unearned income)
//       { accountId: this.PLATFORM_REVENUE_ACCOUNT_ID, direction: Direction.DEBIT, amount: serviceFee, description: 'Withdrawal Reversal: Reverse unearned Service Fee' },

//       // 4. UNDO CREDIT Tax Liability -> DEBIT Tax Liability (Reverse VAT obligation)
//       { accountId: this.TAX_LIABILITY_ACCOUNT_ID, direction: Direction.DEBIT, amount: vatAmount, description: 'Withdrawal Reversal: Reverse VAT Liability' },
//     ];

//     // 3. Execute the atomic reversal transaction
//     return this.ledgerService.createTransaction({
//       type: TransactionType.REVERSAL,
//       entriesData: reversalEntries,
//       mainAccountId: userAccountId // Main account for the reversal event
//     });
//   }

//   async getWalletBalance(accountId: string): Promise<number> {
//     const balance = await this.ledgerService.getAccountBalance(accountId);
//     return balance;
//   }

//   async getWalletTransactions(accountId: string): Promise<Transaction[]> {
//     const transactions = await this.ledgerService.getAccountTransactions(accountId);
//     return transactions;
//   }
// }