import { z } from 'zod';
export declare const LoginRequestSchema: z.ZodObject<{
    username: z.ZodString;
    pin: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    pin: string;
}, {
    username: string;
    pin: string;
}>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export declare const LoginResponseSchema: z.ZodObject<{
    token: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodNumber;
        employeeId: z.ZodNumber;
        username: z.ZodString;
        roleId: z.ZodNumber;
        roleName: z.ZodString;
        permissions: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        username: string;
        id: number;
        employeeId: number;
        roleId: number;
        roleName: string;
        permissions: string[];
    }, {
        username: string;
        id: number;
        employeeId: number;
        roleId: number;
        roleName: string;
        permissions: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    token: string;
    user: {
        username: string;
        id: number;
        employeeId: number;
        roleId: number;
        roleName: string;
        permissions: string[];
    };
}, {
    token: string;
    user: {
        username: string;
        id: number;
        employeeId: number;
        roleId: number;
        roleName: string;
        permissions: string[];
    };
}>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
//# sourceMappingURL=auth-schemas.d.ts.map