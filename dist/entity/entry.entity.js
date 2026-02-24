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
exports.Entry = exports.Direction = void 0;
// src/ledger/entities/entry.entity.ts
const typeorm_1 = require("typeorm");
var Direction;
(function (Direction) {
    Direction["DEBIT"] = "DEBIT";
    Direction["CREDIT"] = "CREDIT";
})(Direction || (exports.Direction = Direction = {}));
let Entry = class Entry {
};
exports.Entry = Entry;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Entry.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true }),
    __metadata("design:type", String)
], Entry.prototype, "tenantId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], Entry.prototype, "transactionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid' }),
    __metadata("design:type", String)
], Entry.prototype, "accountId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: Direction }),
    __metadata("design:type", String)
], Entry.prototype, "direction", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", String)
], Entry.prototype, "amountMinor", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 3 }),
    __metadata("design:type", String)
], Entry.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Entry.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }),
    __metadata("design:type", Date)
], Entry.prototype, "createdAt", void 0);
exports.Entry = Entry = __decorate([
    (0, typeorm_1.Entity)('entries'),
    (0, typeorm_1.Index)(['transactionId']),
    (0, typeorm_1.Index)(['accountId'])
], Entry);
//# sourceMappingURL=entry.entity.js.map