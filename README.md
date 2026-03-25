# Nestjs Accountant

**A fintech-grade, domain-agnostic, and multi-tenant financial ledger engine for NestJS.**

`nestjs-accountant` is a production-hardened accounting kernel designed to power anything from SaaS platforms and marketplaces to mobility and logistics systems. It enforces strict double-entry accounting, atomic balance updates, and full tenant isolation without embedding any domain-specific business logic.

---

## Key Principles

1.  **Domain Agnostic**: No "Users", "Drivers", or "Orders". Only generic primitives (`referenceType`, `referenceId`, `tags`, `context`) to model any vertical.
2.  **Multi-Tenant SaaS Ready**: Every query, index, and constraint is scoped to a `tenantId`.
3.  **Strong Financial Integrity**:
    *   **Double-Entry Enforcement**: Sum of Debits MUST equal Sum of Credits.
    *   **Atomic Balances**: Row-level **Pessimistic Locking** on balance updates.
    *   **Deadlock Prevention**: Deterministic sorted locking of accounts in multi-account transactions.
    *   **Immutability**: Once a transaction is `POSTED` or `REVERSED`, it is final.
4.  **Performance & Safety**:
    *   Uses `BigInt` for all calculations (no floating point errors).
    *   Strict idempotency keys per tenant.
    *   Support for ISO 4217 currencies and base-currency reporting.

## Installation

```bash
npm install nestjs-accountant
```

## Quick Start

### 1. Register Module

The module no longer requires hardcoded system accounts. You provide these dynamically per transaction.

```ts
import { AccountantModule } from 'nestjs-accountant';

@Module({
  imports: [
    AccountantModule.register(),
  ],
})
export class AppModule {}
```

### 2. Core Service: LedgerService

The `LedgerService` is the primary interface for all financial operations. All methods require a `tenantId`.

#### Simple Transfer (Double Entry)
```ts
await ledgerService.createTransaction({
  tenantId: 'my-tenant-uuid',
  referenceType: 'TRANSFER',
  referenceId: 'transfer_01',
  entriesData: [
    { accountId: 'sender_acc', direction: Direction.DEBIT, amountMinor: '1000', currency: 'USD', description: 'Payment' },
    { accountId: 'receiver_acc', direction: Direction.CREDIT, amountMinor: '1000', currency: 'USD', description: 'Payout' },
  ],
});
```

#### Multi-Split Payment (Platform Fee + Tax)
```ts
await ledgerService.createTransaction({
  tenantId: 'tenant_abc',
  referenceType: 'ORDER',
  referenceId: 'order_123',
  entriesData: [
    { accountId: 'customer', direction: Direction.DEBIT, amountMinor: '1000', currency: 'USD', description: 'Total charge' },
    { accountId: 'merchant', direction: Direction.CREDIT, amountMinor: '800', currency: 'USD', description: 'Net' },
    { accountId: 'platform_revenue', direction: Direction.CREDIT, amountMinor: '150', currency: 'USD', description: 'Fee' },
    { accountId: 'tax_liability', direction: Direction.CREDIT, amountMinor: '50', currency: 'USD', description: 'VAT' },
  ],
});
```

#### Handling Escrow
Escrow is handled by moving funds to a tenant-designated holding account.

```ts
// 1. Lock funds
await ledgerService.createTransaction({
  tenantId, referenceType: 'ESCROW', referenceId: 'escrow_1',
  entriesData: [
    { accountId: 'buyer', direction: Direction.DEBIT, amountMinor: '500', currency: 'USD', description: 'Lock funds' },
    { accountId: 'escrow_holding', direction: Direction.CREDIT, amountMinor: '500', currency: 'USD', description: 'Hold' },
  ]
});

// 2. Release funds
await ledgerService.createTransaction({
  tenantId, referenceType: 'ESCROW_RELEASE', referenceId: 'escrow_1',
  entriesData: [
    { accountId: 'escrow_holding', direction: Direction.DEBIT, amountMinor: '500', currency: 'USD', description: 'Release' },
    { accountId: 'seller', direction: Direction.CREDIT, amountMinor: '500', currency: 'USD', description: 'Payout' },
  ]
});
```

#### Transaction life cycle (Pending -> Posted)
Useful for authorization/capture flows or gateway webhooks.

```ts
// Create a pending record
const tx = await ledgerService.createPendingTransaction({
  tenantId, amountMinor: '100', currency: 'USD', referenceId: 'gate_123'
});

// Later, finalize it
await ledgerService.updateTransactionStatus({
  tenantId, transactionId: tx.id, newStatus: TransactionStatus.POSTED
});
```

## Advanced Concepts

### Deadlock Prevention
When multiple concurrent transactions involve the same accounts, deadlocks can occur if locks are acquired in different orders. `nestjs-accountant` automatically **sorts account IDs** before acquiring locks, ensuring a deterministic locking order across the entire system.

### Idempotency
Pass an `idempotencyKey` in `createTransaction`. The engine will ensure that subsequent requests with the same key for the same `tenantId` return the existing transaction record rather than processing it twice.

### Multi-Currency Reporting
You can track a "Base Currency" (e.g., USD) alongside the transaction currency to facilitate global financial reporting.

```ts
await ledgerService.createTransaction({
  // ... core data
  baseCurrency: 'USD',
  baseAmountMinor: '4500', 
  exchangeRate: '0.9',
});
```

## Entity Schema

*   **Account**: The basic unit of the ledger. Generic with `referenceId` and `context`.
*   **Balance**: Optimized row-level balance views per `(tenant, account, currency)`.
*   **Transaction**: The header record for a balanced set of entries.
*   **Entry**: Individual Debit/Credit line items.

## License

ISC
