import { ResolvedAccountantModuleOptions } from '../accountant.config';
import { LedgerService } from '../services/ledger.service';
import { Transaction } from '../entity/transaction.entity';
export declare class WebhookService {
    private ledgerService;
    private readonly moduleOptions;
    constructor(ledgerService: LedgerService, moduleOptions?: ResolvedAccountantModuleOptions);
    private computeRateMinor;
    /**
     * Finds the pending transaction and finalizes the deposit by creating ledger entries.
     */
    finalizeDeposit(externalRefId: string, payloadData: any & {
        transactionId?: string;
    }): Promise<Transaction>;
}
