import { z } from 'zod';

export const MaintenanceStatusEnum = z.enum(['Reported', 'In Progress', 'Completed']);

export const LogMaintenanceRequestSchema = z.object({
  assetId: z.string(),
  issueDescription: z.string().min(1),
  mechanic: z.string().nullable().default(null),
  odometer: z.number().nullable().default(null),
  employeeId: z.string().nullable().default(null),
  storeId: z.string(),
  downtimeStart: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  partsReplaced: z.unknown().nullable().optional(),
  partsCost: z.number().nonnegative().default(0),
  laborCost: z.number().nonnegative().default(0),
  paidFrom: z.string().nullable().optional(),
  expenseAccountId: z.string().nullable().optional(),
  cashAccountId: z.string().nullable().optional(),
  expenseStatus: z.enum(['paid', 'unpaid']).default('paid'),
});

export type LogMaintenanceRequest = z.infer<typeof LogMaintenanceRequestSchema>;

export const SaveMaintenanceRequestSchema = z.object({
  assetId: z.string().optional(),
  issueDescription: z.string().min(1).optional(),
  status: MaintenanceStatusEnum.optional(),
  mechanic: z.string().nullable().optional(),
  odometer: z.number().nullable().optional(),
  nextServiceDue: z.number().nullable().optional(),
  nextServiceDueDate: z.string().nullable().optional(),
  downtimeTracked: z.boolean().optional(),
  downtimeStart: z.string().nullable().optional(),
  downtimeEnd: z.string().nullable().optional(),
  workPerformed: z.string().nullable().optional(),
  partsReplaced: z.unknown().nullable().optional(),
  partsCost: z.number().nonnegative().default(0),
  laborCost: z.number().nonnegative().default(0),
  paidFrom: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  expenseAccountId: z.string().nullable().optional(),
  cashAccountId: z.string().nullable().optional(),
  expenseStatus: z.enum(['paid', 'unpaid']).optional(),
});

export type SaveMaintenanceRequest = z.infer<typeof SaveMaintenanceRequestSchema>;

export const CompleteMaintenanceRequestSchema = z.object({
  maintenanceId: z.string(),
  workPerformed: z.string().min(1),
  partsCost: z.number().nonnegative().default(0),
  laborCost: z.number().nonnegative().default(0),
  paidFrom: z.string().nullable().default(null),
  partsReplaced: z.unknown().nullable().default(null),
  nextServiceDue: z.number().nullable().default(null),
});

export type CompleteMaintenanceRequest = z.infer<typeof CompleteMaintenanceRequestSchema>;

export const MaintenanceQuerySchema = z.object({
  storeId: z.string(),
  status: z.string().optional(),
  vehicleId: z.string().optional(),
});

export type MaintenanceQuery = z.infer<typeof MaintenanceQuerySchema>;
