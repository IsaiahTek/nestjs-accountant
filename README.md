# Nestjs Accountant

**A fintech-grade, domain-agnostic, and multi-tenant financial ledger engine for NestJS.**

`nestjs-accountant` is a production-hardened accounting kernel designed to power anything from SaaS platforms and marketplaces to mobility and logistics systems. It enforces strict double-entry accounting, atomic balance updates, and full tenant isolation without embedding any domain-specific business logic.

---

## 🚀 Key Features

-   **Domain Agnostic**: No "Users", "Drivers", or "Orders". Only generic primitives (`referenceType`, `referenceId`, `tags`, `context`) to model any vertical.
-   **Multi-Tenant SaaS Ready**: Every query, index, and constraint is scoped to a `tenantId` for strict isolation.
-   **Strong Financial Integrity**:
    -   **Double-Entry Enforcement**: Sum of Debits MUST equal Sum of Credits for every transaction.
    -   **Atomic Balances**: Row-level **Pessimistic Locking** ensure thread-safe balance updates.
    -   **Deadlock Prevention**: Deterministic sorted locking of accounts in multi-account transactions.
    -   **Immutability**: Once a transaction is `POSTED` or `REVERSED`, it is final and cannot be modified.
-   **Multi-Currency & Reporting**: Store transactions in any currency while tracking a "Base Currency" and exchange rates for global reporting.
-   **Performance & Precision**: Uses `BigInt` (via string mapping) for all calculations to eliminate floating-point errors.
-   **Idempotency**: Built-in support for `idempotencyKey` per tenant.

---

## 📦 Installation

```bash
npm install nestjs-accountant
```

Note: This library requires `TypeORM` and a PostgreSQL database (recommended for `jsonb` support).

---

## ⚙️ Setup

### 1. Register Entities

The library provides several entities that must be registered in your TypeORM configuration.

```ts
import { Account, Balance, Transaction, Entry } from 'nestjs-accountant';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // ... your config
      entities: [Account, Balance, Transaction, Entry],
      synchronize: true, // or use migrations
    }),
  ],
})
export class AppModule {}
```

### 2. Register Module

```ts
import { AccountantModule } from 'nestjs-accountant';

@Module({
  imports: [
    AccountantModule.register(),
  ],
})
export class AppModule {}
```

---

## 📖 Core Concepts

### Double-Entry Accounting
Every financial event is recorded as a **Transaction** containing at least two **Entries**.
-   **Debit**: Increases ASSET/EXPENSE, decreases LIABILITY/EQUITY/REVENUE.
-   **Credit**: Increases LIABILITY/EQUITY/REVENUE, decreases ASSET/EXPENSE.
-   **Rule**: `Sum(Debits) === Sum(Credits)`

### ALERE Principle (Account Types)
`nestjs-accountant` uses five core account types:
1.  **ASSET**: (Debit Normal) Things you own (e.g., Bank balance, Cash).
2.  **LIABILITY**: (Credit Normal) Things you owe (e.g., User wallets, Tax payable).
3.  **EQUITY**: (Credit Normal) Ownership interest.
4.  **REVENUE**: (Credit Normal) Income earned (e.g., Platform fees).
5.  **EXPENSE**: (Debit Normal) Costs incurred.

---

## 🛠️ Usage Guide

### 1. Account Management

Accounts are the endpoints of your ledger. Use `referenceType` and `referenceId` to link them to your domain models (e.g., Users, Merchants).

```ts
import { LedgerService, AccountType } from 'nestjs-accountant';

// Create a User Wallet (Liability for the platform)
const wallet = await ledgerService.createAccount({
  tenantId: 'my-tenant',
  accountType: AccountType.LIABILITY,
  referenceType: 'USER',
  referenceId: 'user_123',
  metadata: { name: 'Main Wallet' },
  allowNegative: false, // Enforce no overdraft
});

// Find an account by reference
const account = await ledgerService.findAccountByReference('user_123', 'USER', 'my-tenant');
```

### 2. Creating Transactions

#### Simple Transfer (P2P)
```ts
import { Direction } from 'nestjs-accountant';

await ledgerService.createTransaction({
  tenantId: 'my-tenant',
  idempotencyKey: 'transfer_unique_id_1',
  referenceType: 'P2P_TRANSFER',
  referenceId: 'transfer_001',
  entriesData: [
    { 
      accountId: senderId, 
      direction: Direction.DEBIT, 
      amountMinor: '1000', 
      currency: 'USD', 
      description: 'Transfer to User B' 
    },
    { 
      accountId: receiverId, 
      direction: Direction.CREDIT, 
      amountMinor: '1000', 
      currency: 'USD', 
      description: 'Transfer from User A' 
    },
  ],
});
```

#### Multi-Split Payment (Marketplace)
A single transaction can involve many accounts, such as splitting an order between a merchant, the platform, and tax authorities.

```ts
await ledgerService.createTransaction({
  tenantId: 'my-tenant',
  entriesData: [
    { accountId: customer, direction: Direction.DEBIT, amountMinor: '1000', currency: 'USD', description: 'Total charge' },
    { accountId: merchant, direction: Direction.CREDIT, amountMinor: '800', currency: 'USD', description: 'Net payout' },
    { accountId: platform_fee, direction: Direction.CREDIT, amountMinor: '150', currency: 'USD', description: 'Fee' },
    { accountId: tax_payable, direction: Direction.CREDIT, amountMinor: '50', currency: 'USD', description: 'VAT' },
  ],
});
```

### 3. Pending Transactions (Auth & Capture)

Useful for payment gateway flows where funds are authorized but not yet settled.

```ts
// 1. Create a pending record (No balance updates yet)
const tx = await ledgerService.createPendingTransaction({
  tenantId, 
  amountMinor: '5000', 
  currency: 'USD', 
  referenceId: 'auth_789'
});

// 2. Later, finalize and update status
await ledgerService.updateTransactionStatus({
  tenantId, 
  transactionId: tx.id, 
  newStatus: TransactionStatus.POSTED
});
```

### 4. Reversals

Reversing a transaction creates a mirror-image transaction (swapping debits and credits) and links it to the original.

```ts
// This creates a new POSTED transaction that undoes the original
const reversal = await ledgerService.reverseTransaction(originalTxId, 'my-tenant');
```

---

## 🌍 Advanced Features

### Multi-Currency Reporting
Track a "Base Currency" (e.g., your auditing currency) alongside the transaction currency.

```ts
await ledgerService.createTransaction({
  // ... core entries
  baseCurrency: 'USD',
  baseAmountMinor: '4500', 
  exchangeRate: '0.9', // local_amount / base_amount
});
```

### Deadlock Prevention
When processing transactions involving multiple accounts simultaneously, the engine automatically **sorts account IDs** before acquiring locks. This ensures a deterministic locking order and prevents circular wait deadlocks.

### Minor Units & Precision
-   **BigInt Safety**: All amounts are handled as `BigInt` internally and stored as `string` in the database to prevent precision loss.
-   **Minor Units**: Always use minor units (e.g., `"100"` for $1.00).

---

## 📊 Entity Schema

| Entity | Purpose | Key Fields |
| :--- | :--- | :--- |
| **Account** | The ledger account | `accountType`, `referenceType`, `referenceId`, `allowNegative`, `isFrozen` |
| **Balance** | Cached balance view | `amountMinor`, `currency`, `accountId` |
| **Transaction** | Header for entries | `status`, `amountMinor`, `currency`, `idempotencyKey`, `reversalOf` |
| **Entry** | Individual line items | `direction`, `amountMinor`, `accountId`, `exchangeRate` |

---

## ⚖️ License

ISC
