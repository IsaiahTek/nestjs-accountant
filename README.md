# Nestjs Accountant

Double-entry ledger and wallet workflow helpers for NestJS + TypeORM.

## Features

- Balanced double-entry posting with atomic balance updates
- Pending to posted transaction lifecycle
- Built-in idempotency hooks
- P2P transfer with fee + VAT
- Escrow fund and release
- Deposit and withdrawal orchestration
- Webhook finalization flow for async deposits
- Multi-tenant support with optional `tenantId`

## Installation

This package uses peer dependencies for NestJS/TypeORM.

```bash
npm install nestjs-accountant
npm install @nestjs/common @nestjs/core typeorm reflect-metadata rxjs
```

## Exported API

```ts
import {
  AccountantModule,
  LedgerService,
  WalletService,
  WebhookService,
  Account,
  Balance,
  Entry,
  Transaction,
  AccountType,
  Direction,
  TransactionStatus,
} from 'nestjs-accountant';
```

## Quick Start (NestJS)

```ts
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccountantModule,
  Account,
  Balance,
  Entry,
  Transaction,
} from 'nestjs-accountant';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [Account, Balance, Entry, Transaction],
      synchronize: false,
    }),
    AccountantModule,
  ],
})
export class AppModule {}
```

## Database Setup

1. Add these entities to your TypeORM configuration:
1. `Account`
1. `Balance`
1. `Entry`
1. `Transaction`
1. Generate and run migrations in your app.
1. Keep `synchronize: false` in production.

## Core Concepts

### Amount Precision

- `LedgerService` expects `amountMinor` as string integers (`"1000"` for 10.00).
- `WalletService` accepts decimal `number` amounts and internally converts to minor units.

### Double-Entry Enforcement

- Every transaction must have total debits equal total credits.
- Unbalanced entries are rejected before commit.

### Atomic Balance Safety

- Posting is done inside DB transactions.
- Balance rows are locked pessimistically during updates.
- Negative balances are rejected.

### Idempotency

- `idempotencyKey` is supported on pending and posted transaction creation.
- If an existing row matches the key, the existing transaction is returned.

## LedgerService Usage

### Post a custom transaction

```ts
import { Direction } from 'nestjs-accountant';

const tx = await ledgerService.createTransaction({
  type: 'MANUAL_ADJUSTMENT',
  ownerAccountId: userAccountId,
  tenantId,
  idempotencyKey: `adj:${requestId}`,
  metadata: { reason: 'admin-correction' },
  entriesData: [
    {
      tenantId,
      accountId: userAccountId,
      direction: Direction.CREDIT,
      amountMinor: '5000',
      currency: 'USD',
      description: 'Credit user wallet',
    },
    {
      tenantId,
      accountId: platformFundingAccountId,
      direction: Direction.DEBIT,
      amountMinor: '5000',
      currency: 'USD',
      description: 'Funding source',
    },
  ],
});
```

### Create a pending transaction

```ts
const pending = await ledgerService.createPendingTransaction({
  tenantId,
  type: 'DEPOSIT',
  amountMinor: '250000',
  currency: 'USD',
  ownerAccountId: userAccountId,
  idempotencyKey: `deposit-intent:${requestId}`,
  metadata: { channel: 'card' },
});
```

### Update transaction status

```ts
await ledgerService.updateTransactionStatus({
  tenantId,
  transactionId: pending.id,
  newStatus: TransactionStatus.POSTED,
  gatewayRefId: 'gw_123',
});
```

### Balance and history

```ts
const balanceMinor = await ledgerService.getAccountBalance(userAccountId, 'USD');
const txs = await ledgerService.getAccountTransactions(userAccountId);
```

## WalletService Usage

### Payment callback signature

```ts
type PaymentCallback = (payload: {
  amount: number;
  transactionId: string;
  paymentMethodId?: string;
}) => Promise<string>; // must return gatewayRefId
```

### P2P with fee and VAT

```ts
await walletService.sendP2PWithFeeAndVAT(
  senderAccountId,
  recipientAccountId,
  100,    // principal amount
  0.01,   // fee rate 1%
  0.075,  // VAT on fee 7.5%
  'USD',
);
```

### Fund and release escrow

```ts
await walletService.fundEscrow(buyerAccountId, 150, escrowRefId, 'USD');
await walletService.releaseEscrow(sellerAccountId, 150, escrowRefId, 'USD');
```

### Handle deposit (synchronous callback flow)

```ts
const tx = await walletService.handleDeposit({
  userAccountId,
  grossAmount: 200,
  paymentToken: 'tok_abc',
  depositFeeRate: 0.02,
  depositVatRate: 0.15,
  currency: 'USD',
  tenantId,
  idempotencyKey: `deposit:${requestId}`,
  metadata: { source: 'checkout' },
  paymentCallback: async ({ amount, transactionId, paymentMethodId }) => {
    const gatewayRefId = await gateway.charge({
      amount,
      localRef: transactionId,
      token: paymentMethodId,
    });
    return gatewayRefId;
  },
});
```

### Handle withdrawal

```ts
await walletService.handleWithdrawal({
  userAccountId,
  netAmount: 100,
  bankAccountId: 'bank_123',
  withdrawalFeeAmount: 2,
  withdrawalVatAmount: 0.3,
  currency: 'USD',
  tenantId,
  idempotencyKey: `withdrawal:${requestId}`,
  paymentCallback: async ({ amount, transactionId, paymentMethodId }) => {
    const gatewayRefId = await gateway.payout({
      amount,
      localRef: transactionId,
      bankAccountId: paymentMethodId,
    });
    return gatewayRefId;
  },
});
```

### Wallet read helpers

```ts
const walletBalance = await walletService.getWalletBalance(userAccountId); // major unit number
const walletTransactions = await walletService.getWalletTransactions(userAccountId);
```

## WebhookService Usage (Async Deposit Finalization)

Use this when deposit charge confirmation arrives later via webhook.

```ts
await webhookService.finalizeDeposit(externalGatewayRefId, {
  transactionId: pendingTransactionId, // optional but recommended
  rawPayload: webhookPayload,
});
```

What it does:

1. Resolves pending transaction by `transactionId` or `externalRefId`
1. Recomputes fee + VAT using pending metadata (or defaults)
1. Posts final double-entry deposit transaction
1. Marks pending transaction `POSTED` or `FAILED`

## Transaction Status Lifecycle

- `PENDING`: Intent created, not finalized
- `POSTED`: Finalized and applied
- `FAILED`: Finalization failed
- `REVERSED`: Reserved for reversal flows

## Important Notes

1. System account IDs are currently hardcoded inside `WalletService` and `WebhookService`.
1. `PLATFORM_REVENUE_ACCOUNT_ID`
1. `TAX_LIABILITY_ACCOUNT_ID`
1. `EXTERNAL_CASH_ACCOUNT_ID`
1. `ESCROW_HOLDING_ACCOUNT_ID` (wallet service only)
1. Replace these with real account IDs in your deployment.
1. Use idempotency keys for all external-facing write operations.
1. Keep all entries in a transaction in the same currency.

## Error Handling Expectations

- Insufficient funds throws `BadRequestException`
- Missing transaction/reference throws `NotFoundException`
- Gateway and posting failures surface as `BadRequestException` or `InternalServerErrorException` depending on flow

## Build

```bash
npm run build
```
