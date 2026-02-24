"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Account = exports.AccountType = void 0;
// src/ledger/entities/account.entity.ts
const typeorm_1 = require("typeorm");
var AccountType;
(function (AccountType) {
    AccountType[AccountType["ASSET"] = 0] = "ASSET";
    AccountType[AccountType["LIABILITY"] = 1] = "LIABILITY";
    AccountType[AccountType["EQUITY"] = 2] = "EQUITY";
    AccountType[AccountType["REVENUE"] = 3] = "REVENUE";
    AccountType[AccountType["EXPENSE"] = 4] = "EXPENSE";
})(AccountType || (exports.AccountType = AccountType = {}));
let Account = class Account {
};
exports.Account = Account;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Account.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], Account.prototype, "tenantId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], Account.prototype, "ownerId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: AccountType }),
    __metadata("design:type", Number)
], Account.prototype, "accountType", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Account.prototype, "isFrozen", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }),
    __metadata("design:type", Date)
], Account.prototype, "createdAt", void 0);
exports.Account = Account = __decorate([
    (0, typeorm_1.Entity)('accounts'),
    (0, typeorm_1.Index)(['tenantId', 'ownerId', 'accountType'])
], Account);
//# sourceMappingURL=account.entity.js.map