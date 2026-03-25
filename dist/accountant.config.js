"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAccountantOptionsProvider = exports.resolveAccountantModuleOptions = exports.defaultAccountantModuleOptions = exports.ACCOUNTANT_MODULE_OPTIONS = void 0;
exports.ACCOUNTANT_MODULE_OPTIONS = 'ACCOUNTANT_MODULE_OPTIONS';
exports.defaultAccountantModuleOptions = {};
const resolveAccountantModuleOptions = (options = {}) => ({
    ...exports.defaultAccountantModuleOptions,
    ...options,
});
exports.resolveAccountantModuleOptions = resolveAccountantModuleOptions;
const createAccountantOptionsProvider = (options = {}) => ({
    provide: exports.ACCOUNTANT_MODULE_OPTIONS,
    useValue: (0, exports.resolveAccountantModuleOptions)(options),
});
exports.createAccountantOptionsProvider = createAccountantOptionsProvider;
//# sourceMappingURL=accountant.config.js.map