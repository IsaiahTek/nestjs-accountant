import { DynamicModule } from '@nestjs/common';
import { AccountantModuleOptions } from './accountant.config';
export declare class AccountantModule {
    static register(options?: AccountantModuleOptions): DynamicModule;
}
