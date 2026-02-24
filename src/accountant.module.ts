import { Module } from '@nestjs/common';
import { LedgerService } from './services/ledger.service';
import { WalletService } from './services/wallet.service';
import { WebhookService } from './webhook/payment.webhook';

@Module({
  providers: [LedgerService, WalletService, WebhookService],
  exports: [LedgerService, WalletService, WebhookService],
})
export class AccountantModule {}
