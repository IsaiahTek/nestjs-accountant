// // src/ledger/ledger.service.ts
// import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
// import { DataSource, EntityManager } from 'typeorm';
// import { Transaction, TransactionStatus, TransactionType } from '../entity/transaction.entity';
// import { Entry, Direction } from '../entity/entry.entity';
// import { Account } from '../entity/account.entity';
// import { EntryDto } from '../dto/entry.dto';

// @Injectable()
// export class LedgerService {
//   // Injecting DataSource to start transactions
//   constructor(private dataSource: DataSource) { }

//     async findPendingTransactionByRefId(externalRefId: string): Promise<Transaction> {
//     const transaction = await this.dataSource.getRepository(Transaction).findOne({
//       where: {
//         gatewayRefId: externalRefId,
//         status: TransactionStatus.PENDING,
//       },
//     });

//     if (!transaction) {
//       throw new NotFoundException(`Transaction with ref ${externalRefId} not found.`);
//     }

//     return transaction;
//   }

//   async findTransactionByRefId(externalRefId: string): Promise<Transaction> {
//     const transaction = await this.dataSource.getRepository(Transaction).findOne({
//       where: {
//         gatewayRefId: externalRefId,
//       },
//     });

//     if (!transaction) {
//       throw new NotFoundException(`Transaction with ref ${externalRefId} not found.`);
//     }

//     return transaction;
//   }
   

//   /**
//    * CRITICAL METHOD: Creates a balanced transaction and updates accounts atomically.
//    */
//   async createTransaction(payload: {
//     type: TransactionType,
//     entriesData: EntryDto[],
//     mainAccountId: string,
//     gatewayRefId?: string,
//   }): Promise<Transaction> {

//     const { type, entriesData, mainAccountId, gatewayRefId } = payload;
//     // 1. Balance Check: Ensures financial integrity
//     const totalDebits = entriesData.filter(e => e.direction === Direction.DEBIT).reduce((sum, e) => sum + e.amount, 0);
//     const totalCredits = entriesData.filter(e => e.direction === Direction.CREDIT).reduce((sum, e) => sum + e.amount, 0);

//     if (Math.abs(totalDebits - totalCredits) > 0.0001) { // Check for floating point safety
//       throw new BadRequestException(`Transaction entries are unbalanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
//     }

//     // 2. Atomic Database Transaction (ACID properties guaranteed here)
//     return this.dataSource.transaction(async (manager: EntityManager) => {

//       // 2a. Create the parent Transaction record
//       const transaction = manager.create(Transaction, {
//         amount: totalDebits, // Total transaction value
//         type,
//         status: TransactionStatus.SUCCESS,
//         gatewayRefId,
//         mainAccountId,
//       });
//       await manager.save(transaction);

//       // 2b. Create all Entry records and update account balances
//       for (const entryData of entriesData) {
//         const entry = manager.create(Entry, {
//           ...entryData,
//           transactionId: transaction.id,
//         });
//         await manager.save(entry);

//         // Update the cached Account balance
//         await this.updateAccountBalance(manager, entryData.accountId, entryData.amount, entryData.direction);
//       }

//       return transaction;
//     });
//   }

//   /**
//    * Helper function to atomically update the cached balance.
//    */
//   private async updateAccountBalance(
//     manager: EntityManager,
//     accountId: string,
//     amount: number,
//     direction: Direction,
//   ): Promise<void> {
//     // For User Wallet accounts (Liabilities), CREDIT increases balance (+1), DEBIT decreases (-1)
//     const multiplier = direction === Direction.CREDIT ? 1 : -1;
//     const change = multiplier * amount;

//     const result = await manager
//       .getRepository(Account)
//       .increment({ id: accountId }, 'currentBalance', change);

//     if (result.affected === 0) {
//       throw new InternalServerErrorException(`Failed to update balance for account ${accountId}.`);
//     }
//   }

//   // --- Public Lifecycle Methods (Corrected to use DataSource/EntityManager) ---

//   /**
//    * Public: Creates a PENDING transaction record without creating entries or moving money.
//    * Used as the first step for deposits/withdrawals via PG.
//    */
//   async createPendingTransaction(
//     type: TransactionType,
//     amount: number,
//     // NEW ARGUMENT
//     mainAccountId: string
//   ): Promise<Transaction> {
//     const transactionRepository = this.dataSource.getRepository(Transaction);

//     const transaction = transactionRepository.create({
//       amount,
//       type,
//       status: TransactionStatus.PENDING,
//       // NEW USAGE
//       mainAccountId: mainAccountId,
//     });
//     return transactionRepository.save(transaction);
//   }

//   /**
//    * Public: Updates the status or gateway reference of an existing transaction.
//    */
//   async updateTransaction(
//     transactionId: string,
//     data: Partial<Transaction>
//   ): Promise<void> {
//     // Use the DataSource's manager to perform a single, non-transactional operation
//     await this.dataSource.getRepository(Transaction).update(transactionId, data);
//   }

//   // New method needed by WalletService to enforce balance checks
//   async getAccountBalance(accountId: string): Promise<number> {
//     // Use the DataSource's manager to perform a single read
//     const account = await this.dataSource.getRepository(Account).findOneBy({ id: accountId });

//     if (!account) {
//       // Correct error handling when account is not found
//       throw new NotFoundException(`Account with ID ${accountId} not found.`);
//     }
//     return account.currentBalance;
//   }

//   async getAccountTransactions(accountId: string): Promise<Transaction[]> {
//     // Use the DataSource's manager to perform a single read
//     const transactions = this.dataSource.getRepository(Transaction).findBy({ mainAccountId: accountId });
//     return transactions;
//   }
// }