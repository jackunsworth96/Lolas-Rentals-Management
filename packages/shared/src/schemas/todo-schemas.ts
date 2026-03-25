import { z } from 'zod';

export const TaskPriorityEnum = z.enum(['Low', 'Medium', 'High', 'Urgent']);
export const TaskStatusEnum = z.enum([
  'Created',
  'Acknowledged',
  'In Progress',
  'Pending Verification',
  'Closed',
]);

export const TodoQuerySchema = z.object({
  storeId: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedTo: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  isEscalated: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type TodoQuery = z.infer<typeof TodoQuerySchema>;

export const CreateTaskRequestSchema = z.object({
  storeId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  categoryId: z.number().nullable().default(null),
  assignedTo: z.string().min(1),
  vehicleId: z.string().nullable().default(null),
  priority: TaskPriorityEnum.default('Medium'),
  dueDate: z.string().nullable().default(null),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const UpdateTaskRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.number().nullable().optional(),
  assignedTo: z.string().min(1).optional(),
  vehicleId: z.string().nullable().optional(),
  priority: TaskPriorityEnum.optional(),
  dueDate: z.string().nullable().optional(),
});

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

export const AddCommentRequestSchema = z.object({
  content: z.string().min(1),
});

export type AddCommentRequest = z.infer<typeof AddCommentRequestSchema>;

export const RejectTaskRequestSchema = z.object({
  reason: z.string().min(1),
});

export type RejectTaskRequest = z.infer<typeof RejectTaskRequestSchema>;

export const EscalateTaskRequestSchema = z.object({
  reason: z.string().min(1),
});

export type EscalateTaskRequest = z.infer<typeof EscalateTaskRequestSchema>;

export const TodoReportQuerySchema = z.object({
  storeId: z.string().optional(),
  from: z.string().min(1),
  to: z.string().min(1),
});

export type TodoReportQuery = z.infer<typeof TodoReportQuerySchema>;
