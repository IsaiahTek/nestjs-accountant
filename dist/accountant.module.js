"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AccountantModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountantModule = void 0;
const common_1 = require("@nestjs/common");
const accountant_config_1 = require("./accountant.config");
const ledger_service_1 = require("./services/ledger.service");
let AccountantModule = AccountantModule_1 = class AccountantModule {
    static register(options = {}) {
        return {
            module: AccountantModule_1,
            providers: [(0, accountant_config_1.createAccountantOptionsProvider)(options)],
            exports: [ledger_service_1.LedgerService],
        };
    }
};
exports.AccountantModule = AccountantModule;
exports.AccountantModule = AccountantModule = AccountantModule_1 = __decorate([
    (0, common_1.Module)({
        providers: [
            (0, accountant_config_1.createAccountantOptionsProvider)(),
            ledger_service_1.LedgerService,
        ],
        exports: [ledger_service_1.LedgerService],
    })
], AccountantModule);
//# sourceMappingURL=accountant.module.js.map