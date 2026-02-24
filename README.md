# Nestjs Accountant

A NestJS ledger/accounting helper library for posting balanced transactions and wallet flows.

## Install

```bash
npm install nestjs-accountant
```

## Use in a NestJS app

1. Configure TypeORM in your app (`TypeOrmModule.forRoot(...)`).
2. Import `AccountantModule`.

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountantModule } from 'nestjs-accountant';
import { Account, Balance, Entry, Transaction } from 'nestjs-accountant';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // your db config
      entities: [Account, Balance, Entry, Transaction],
      synchronize: false,
    }),
    AccountantModule,
  ],
})
export class AppModule {}
```

Then inject `LedgerService`, `WalletService`, or `WebhookService` in your services/controllers.
