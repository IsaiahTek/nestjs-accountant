// src/common/types/gateway.types.ts

/**
 * Defines the generic payload structure for calling any external payment service.
 */
export interface PaymentCallbackPayload {
    /**
     * @returns The amount of money for the transaction that you passed in.
     */

    amount: number;
    /**
     * @returns The ID of the transaction in the ledger.
     */
    transactionId: string; 
    
    /**
     * @returns The ID of the `paymentToken` or `bankAccountId` passed into the WalletService method for the transaction just exactly as you passed it.
     * It is not used for any business logic. It only serves as a reference to the payment unique ID such as the last 4 digits of a credit card and therefore should be tokenized.
     * 
     */
    paymentMethodId?: string; // Token, bank account ID, etc.
}

/**
 * Defines the generic function signature for integrating external payment methods.
 */
export type PaymentCallback = (
    payload: PaymentCallbackPayload
) => Promise<string>; // Must return the external gatewayRefId