import { Provider } from '@nestjs/common';
export interface AccountantModuleOptions {
}
export interface ResolvedAccountantModuleOptions {
}
export declare const ACCOUNTANT_MODULE_OPTIONS = "ACCOUNTANT_MODULE_OPTIONS";
export declare const defaultAccountantModuleOptions: ResolvedAccountantModuleOptions;
export declare const resolveAccountantModuleOptions: (options?: AccountantModuleOptions) => ResolvedAccountantModuleOptions;
export declare const createAccountantOptionsProvider: (options?: AccountantModuleOptions) => Provider;
