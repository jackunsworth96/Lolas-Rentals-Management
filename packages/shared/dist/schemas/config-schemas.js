import { z } from 'zod';
export const SaveAddonRequestSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    defaultPrice: z.number().nonnegative(),
    isActive: z.boolean().optional(),
});
export const SaveLocationRequestSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    address: z.string().optional(),
    phone: z.string().optional(),
    isActive: z.boolean().optional(),
});
export const SavePaymentMethodRequestSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    accountId: z.number(),
    isActive: z.boolean().optional(),
});
export const SaveVehicleTypeRequestSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    defaultRatePerDay: z.number().nonnegative(),
    isActive: z.boolean().optional(),
});
export const SaveAccountRequestSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
    parentAccountId: z.number().nullable().optional(),
    isActive: z.boolean().optional(),
});
export const SaveRoleRequestSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    permissions: z.array(z.string()).min(1),
});
export const CreateEmployeeRequestSchema = z.object({
    fullName: z.string().min(1),
    storeId: z.string().min(1),
    role: z.string().nullable().optional(),
    status: z.enum(['Active', 'Inactive']).default('Active'),
    birthday: z.string().nullable().optional(),
    emergencyContactName: z.string().nullable().optional(),
    emergencyContactNumber: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    probationEndDate: z.string().nullable().optional(),
    rateType: z.enum(['daily', 'monthly']).nullable().optional(),
    basicRate: z.number().nonnegative().default(0),
    overtimeRate: z.number().nonnegative().default(0),
    ninePmBonusRate: z.number().nonnegative().default(0),
    commissionRate: z.number().nonnegative().default(0),
    paidAs: z.string().nullable().optional(),
    monthlyBikeAllowance: z.number().nonnegative().default(0),
    holidayAllowance: z.number().nonnegative().default(0),
    sickAllowance: z.number().nonnegative().default(0),
    sssNo: z.string().nullable().optional(),
    philhealthNo: z.string().nullable().optional(),
    pagibigNo: z.string().nullable().optional(),
    tin: z.string().nullable().optional(),
    sssDeductionAmt: z.number().nonnegative().default(0),
    philhealthDeductionAmt: z.number().nonnegative().default(0),
    pagibigDeductionAmt: z.number().nonnegative().default(0),
});
export const UpdateEmployeeRequestSchema = CreateEmployeeRequestSchema.partial().extend({
    id: z.string().optional(),
});
//# sourceMappingURL=config-schemas.js.map