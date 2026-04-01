import { z } from 'zod';
export declare const TaskPriorityEnum: z.ZodEnum<["Low", "Medium", "High", "Urgent"]>;
export declare const TaskStatusEnum: z.ZodEnum<["Created", "Acknowledged", "In Progress", "Pending Verification", "Closed"]>;
export declare const TodoQuerySchema: z.ZodObject<{
    storeId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodNumber>;
    isEscalated: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    status?: string | undefined;
    storeId?: string | undefined;
    priority?: string | undefined;
    assignedTo?: string | undefined;
    categoryId?: number | undefined;
    isEscalated?: boolean | undefined;
}, {
    status?: string | undefined;
    storeId?: string | undefined;
    priority?: string | undefined;
    assignedTo?: string | undefined;
    categoryId?: number | undefined;
    isEscalated?: "true" | "false" | undefined;
}>;
export type TodoQuery = z.infer<typeof TodoQuerySchema>;
export declare const CreateTaskRequestSchema: z.ZodObject<{
    storeId: z.ZodString;
    title: z.ZodString;
    description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    categoryId: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    assignedTo: z.ZodString;
    vehicleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    priority: z.ZodDefault<z.ZodEnum<["Low", "Medium", "High", "Urgent"]>>;
    dueDate: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    vehicleId: string | null;
    description: string | null;
    storeId: string;
    priority: "Low" | "Medium" | "High" | "Urgent";
    assignedTo: string;
    categoryId: number | null;
    title: string;
    dueDate: string | null;
}, {
    storeId: string;
    assignedTo: string;
    title: string;
    vehicleId?: string | null | undefined;
    description?: string | null | undefined;
    priority?: "Low" | "Medium" | "High" | "Urgent" | undefined;
    categoryId?: number | null | undefined;
    dueDate?: string | null | undefined;
}>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export declare const UpdateTaskRequestSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    assignedTo: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    priority: z.ZodOptional<z.ZodEnum<["Low", "Medium", "High", "Urgent"]>>;
    dueDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    vehicleId?: string | null | undefined;
    description?: string | null | undefined;
    priority?: "Low" | "Medium" | "High" | "Urgent" | undefined;
    assignedTo?: string | undefined;
    categoryId?: number | null | undefined;
    title?: string | undefined;
    dueDate?: string | null | undefined;
}, {
    vehicleId?: string | null | undefined;
    description?: string | null | undefined;
    priority?: "Low" | "Medium" | "High" | "Urgent" | undefined;
    assignedTo?: string | undefined;
    categoryId?: number | null | undefined;
    title?: string | undefined;
    dueDate?: string | null | undefined;
}>;
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;
export declare const AddCommentRequestSchema: z.ZodObject<{
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
}, {
    content: string;
}>;
export type AddCommentRequest = z.infer<typeof AddCommentRequestSchema>;
export declare const RejectTaskRequestSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export type RejectTaskRequest = z.infer<typeof RejectTaskRequestSchema>;
export declare const EscalateTaskRequestSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export type EscalateTaskRequest = z.infer<typeof EscalateTaskRequestSchema>;
export declare const TodoReportQuerySchema: z.ZodObject<{
    storeId: z.ZodOptional<z.ZodString>;
    from: z.ZodString;
    to: z.ZodString;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    storeId?: string | undefined;
}, {
    from: string;
    to: string;
    storeId?: string | undefined;
}>;
export type TodoReportQuery = z.infer<typeof TodoReportQuerySchema>;
//# sourceMappingURL=todo-schemas.d.ts.map