import { Provider } from '@nestjs/common';
export interface AccountantModuleOptions {
    platformRevenueAccountId?: string;
    taxLiabilityAccountId?: string;
    externalCashAccountId?: string;
    escrowHoldingAccountId?: string;
    depositFeeRate?: number;
    depositVatRate?: number;
}
export interface ResolvedAccountantModuleOptions {
    platformRevenueAccountId: string;
    taxLiabilityAccountId: string;
    externalCashAccountId: string;
    escrowHoldingAccountId: string;
    depositFeeRate: number;
    depositVatRate: number;
}
export declare const ACCOUNTANT_MODULE_OPTIONS = "ACCOUNTANT_MODULE_OPTIONS";
export declare const defaultAccountantModuleOptions: ResolvedAccountantModuleOptions;
export declare const resolveAccountantModuleOptions: (options?: AccountantModuleOptions) => ResolvedAccountantModuleOptions;
export declare const createAccountantOptionsProvider: (options?: AccountantModuleOptions) => Provider;
