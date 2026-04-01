import { z } from 'zod';
export declare const PaymentRoutingRuleSchema: z.ZodObject<{
    storeId: z.ZodString;
    paymentMethodId: z.ZodString;
    receivedIntoAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cardSettlementAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    paymentMethodId: string;
    storeId: string;
    receivedIntoAccountId?: string | null | undefined;
    cardSettlementAccountId?: string | null | undefined;
}, {
    paymentMethodId: string;
    storeId: string;
    receivedIntoAccountId?: string | null | undefined;
    cardSettlementAccountId?: string | null | undefined;
}>;
export declare const SavePaymentRoutingSchema: z.ZodObject<{
    rules: z.ZodArray<z.ZodObject<{
        storeId: z.ZodString;
        paymentMethodId: z.ZodString;
        receivedIntoAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        cardSettlementAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        paymentMethodId: string;
        storeId: string;
        receivedIntoAccountId?: string | null | undefined;
        cardSettlementAccountId?: string | null | undefined;
    }, {
        paymentMethodId: string;
        storeId: string;
        receivedIntoAccountId?: string | null | undefined;
        cardSettlementAccountId?: string | null | undefined;
    }>, "many">;
    storeDefaults: z.ZodOptional<z.ZodObject<{
        storeId: z.ZodString;
        cardFeeAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        defaultCashAccountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        storeId: string;
        cardFeeAccountId?: string | null | undefined;
        defaultCashAccountId?: string | null | undefined;
    }, {
        storeId: string;
        cardFeeAccountId?: string | null | undefined;
        defaultCashAccountId?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    rules: {
        paymentMethodId: string;
        storeId: string;
        receivedIntoAccountId?: string | null | undefined;
        cardSettlementAccountId?: string | null | undefined;
    }[];
    storeDefaults?: {
        storeId: string;
        cardFeeAccountId?: string | null | undefined;
        defaultCashAccountId?: string | null | undefined;
    } | undefined;
}, {
    rules: {
        paymentMethodId: string;
        storeId: string;
        receivedIntoAccountId?: string | null | undefined;
        cardSettlementAccountId?: string | null | undefined;
    }[];
    storeDefaults?: {
        storeId: string;
        cardFeeAccountId?: string | null | undefined;
        defaultCashAccountId?: string | null | undefined;
    } | undefined;
}>;
//# sourceMappingURL=payment-routing-schemas.d.ts.map