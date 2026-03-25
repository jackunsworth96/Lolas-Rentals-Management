import { z } from 'zod';

export const PaymentRoutingRuleSchema = z.object({
  storeId: z.string().min(1),
  paymentMethodId: z.string().min(1),
  receivedIntoAccountId: z.string().nullable().optional(),
  cardSettlementAccountId: z.string().nullable().optional(),
});

export const SavePaymentRoutingSchema = z.object({
  rules: z.array(PaymentRoutingRuleSchema),
  storeDefaults: z.object({
    storeId: z.string().min(1),
    cardFeeAccountId: z.string().nullable().optional(),
    defaultCashAccountId: z.string().nullable().optional(),
  }).optional(),
});
