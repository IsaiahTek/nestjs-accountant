import { DynamicModule, Module } from '@nestjs/common';
import {
  AccountantModuleOptions,
  createAccountantOptionsProvider,
} from './accountant.config';
import { LedgerService } from './services/ledger.service';

@Module({
  providers: [
    createAccountantOptionsProvider(),
    LedgerService,
  ],
  exports: [LedgerService],
})
export class AccountantModule {
  static register(options: AccountantModuleOptions = {}): DynamicModule {
    return {
      module: AccountantModule,
      providers: [createAccountantOptionsProvider(options)],
      exports: [LedgerService],
    };
  }
}
