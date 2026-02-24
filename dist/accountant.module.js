"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountantModule = void 0;
const common_1 = require("@nestjs/common");
const ledger_service_1 = require("./services/ledger.service");
const wallet_service_1 = require("./services/wallet.service");
const payment_webhook_1 = require("./webhook/payment.webhook");
let AccountantModule = class AccountantModule {
};
exports.AccountantModule = AccountantModule;
exports.AccountantModule = AccountantModule = __decorate([
    (0, common_1.Module)({
        providers: [ledger_service_1.LedgerService, wallet_service_1.WalletService, payment_webhook_1.WebhookService],
        exports: [ledger_service_1.LedgerService, wallet_service_1.WalletService, payment_webhook_1.WebhookService],
    })
], AccountantModule);
//# sourceMappingURL=accountant.module.js.map