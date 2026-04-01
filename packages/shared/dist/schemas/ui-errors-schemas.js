import { z } from 'zod';
export const UiErrorListQuerySchema = z.object({
    status: z.enum(['all', 'outstanding', 'fixed']).optional(),
});
export const CreateUiErrorRequestSchema = z.object({
    page: z.string().min(1).max(200),
    errorDescription: z.string().min(1).max(8000),
    ideaAndImprovements: z.string().max(8000).nullable().optional(),
});
export const UpdateUiErrorRequestSchema = z.object({
    fixed: z.boolean(),
});
//# sourceMappingURL=ui-errors-schemas.js.map