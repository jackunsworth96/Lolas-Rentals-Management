import { z } from 'zod';
export const LoginRequestSchema = z.object({
    username: z.string().min(1),
    pin: z.coerce.string().min(1),
});
export const LoginResponseSchema = z.object({
    token: z.string(),
    user: z.object({
        id: z.number(),
        employeeId: z.number(),
        username: z.string(),
        roleId: z.number(),
        roleName: z.string(),
        permissions: z.array(z.string()),
    }),
});
//# sourceMappingURL=auth-schemas.js.map