import { LedgerService } from '../services/ledger.service';
import { Transaction } from '../entity/transaction.entity';
export declare class WebhookService {
    private ledgerService;
    private PLATFORM_REVENUE_ACCOUNT_ID;
    private TAX_LIABILITY_ACCOUNT_ID;
    private EXTERNAL_CASH_ACCOUNT_ID;
    private DEPOSIT_FEE_RATE;
    private DEPOSIT_VAT_RATE;
    constructor(ledgerService: LedgerService);
    private computeRateMinor;
    /**
     * Finds the pending transaction and finalizes the deposit by creating ledger entries.
     */
    finalizeDeposit(externalRefId: string, payloadData: any): Promise<Transaction>;
}
