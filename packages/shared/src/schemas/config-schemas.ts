import { z } from 'zod';

export const SaveAddonRequestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  defaultPrice: z.number().nonnegative(),
  isActive: z.boolean().optional(),
});

export type SaveAddonRequest = z.infer<typeof SaveAddonRequestSchema>;

export const SaveLocationRequestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type SaveLocationRequest = z.infer<typeof SaveLocationRequestSchema>;

export const SavePaymentMethodRequestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  accountId: z.number(),
  isActive: z.boolean().optional(),
});

export type SavePaymentMethodRequest = z.infer<
  typeof SavePaymentMethodRequestSchema
>;

export const SaveVehicleTypeRequestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  defaultRatePerDay: z.number().nonnegative(),
  isActive: z.boolean().optional(),
});

export type SaveVehicleTypeRequest = z.infer<
  typeof SaveVehicleTypeRequestSchema
>;

export const SaveAccountRequestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentAccountId: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type SaveAccountRequest = z.infer<typeof SaveAccountRequestSchema>;

export const SaveRoleRequestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  permissions: z.array(z.string()).min(1),
});

export type SaveRoleRequest = z.infer<typeof SaveRoleRequestSchema>;

export const SaveEmployeeRequestSchema = z.object({
  id: z.number().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  locationId: z.number(),
  roleId: z.number(),
  hourlyRate: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export type SaveEmployeeRequest = z.infer<typeof SaveEmployeeRequestSchema>;
