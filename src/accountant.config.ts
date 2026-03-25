import { Provider } from '@nestjs/common';

export interface AccountantModuleOptions {
  // Add any generic engine-wide configuration if needed
}

export interface ResolvedAccountantModuleOptions {
}

export const ACCOUNTANT_MODULE_OPTIONS = 'ACCOUNTANT_MODULE_OPTIONS';

export const defaultAccountantModuleOptions: ResolvedAccountantModuleOptions = {
};

export const resolveAccountantModuleOptions = (
  options: AccountantModuleOptions = {},
): ResolvedAccountantModuleOptions => ({
  ...defaultAccountantModuleOptions,
  ...options,
});

export const createAccountantOptionsProvider = (
  options: AccountantModuleOptions = {},
): Provider => ({
  provide: ACCOUNTANT_MODULE_OPTIONS,
  useValue: resolveAccountantModuleOptions(options),
});
