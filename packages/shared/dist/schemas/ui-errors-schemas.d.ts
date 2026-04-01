import { z } from 'zod';
export declare const UiErrorListQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["all", "outstanding", "fixed"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "all" | "outstanding" | "fixed" | undefined;
}, {
    status?: "all" | "outstanding" | "fixed" | undefined;
}>;
export type UiErrorListQuery = z.infer<typeof UiErrorListQuerySchema>;
export declare const CreateUiErrorRequestSchema: z.ZodObject<{
    page: z.ZodString;
    errorDescription: z.ZodString;
    ideaAndImprovements: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    page: string;
    errorDescription: string;
    ideaAndImprovements?: string | null | undefined;
}, {
    page: string;
    errorDescription: string;
    ideaAndImprovements?: string | null | undefined;
}>;
export type CreateUiErrorRequest = z.infer<typeof CreateUiErrorRequestSchema>;
export declare const UpdateUiErrorRequestSchema: z.ZodObject<{
    fixed: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    fixed: boolean;
}, {
    fixed: boolean;
}>;
export type UpdateUiErrorRequest = z.infer<typeof UpdateUiErrorRequestSchema>;
//# sourceMappingURL=ui-errors-schemas.d.ts.map