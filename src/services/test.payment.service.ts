import { LedgerService } from "./ledger.service";
import { WalletService } from "./wallet.service";

const dataSource = null;
const ledgerService = new LedgerService(dataSource);
const walletService = new WalletService(ledgerService);

const payWithPayNow = async (userAccountId: string, amount: number) => {
    return await Promise.resolve('uuid-pg-ref');
}

const payWithWePay = async (userAccountId: string, amount: number) => {
    return await Promise.resolve('uuid-pg-ref');
}

// walletService.handleDeposit(
//     'uuid-user-acc',
//     100,
//     'uuid-bank-acc',
//     async (data) => {
//         const paymentId = await payWithPayNow(data.transactionId, data.amount);
//         return paymentId;
//     }
// );

// walletService.handleDeposit(
//     'uuid-user-acc',
//     100,
//     'uuid-bank-acc',
//     async (data) => {
//         const paymentId = await payWithWePay('uuid-user-acc', data.amount);
//         return paymentId;
//     }
// )
