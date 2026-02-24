"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ledger_service_1 = require("./ledger.service");
const wallet_service_1 = require("./wallet.service");
const dataSource = null;
const ledgerService = new ledger_service_1.LedgerService(dataSource);
const walletService = new wallet_service_1.WalletService(ledgerService);
const payWithPayNow = async (userAccountId, amount) => {
    return await Promise.resolve('uuid-pg-ref');
};
const payWithWePay = async (userAccountId, amount) => {
    return await Promise.resolve('uuid-pg-ref');
};
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
//# sourceMappingURL=test.payment.service.js.map