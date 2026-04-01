import { z } from 'zod';
export declare const TimesheetEntrySchema: z.ZodObject<{
    date: z.ZodString;
    employeeId: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    dayType: z.ZodString;
    timeIn: z.ZodNullable<z.ZodString>;
    timeOut: z.ZodNullable<z.ZodString>;
    ninePmReturnsCount: z.ZodDefault<z.ZodNumber>;
    dailyNotes: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    silInflation: z.ZodDefault<z.ZodNumber>;
    storeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: string;
    employeeId: string;
    storeId: string;
    name: string | null;
    dayType: string;
    timeIn: string | null;
    timeOut: string | null;
    ninePmReturnsCount: number;
    dailyNotes: string | null;
    silInflation: number;
}, {
    date: string;
    employeeId: string;
    storeId: string;
    name: string | null;
    dayType: string;
    timeIn: string | null;
    timeOut: string | null;
    ninePmReturnsCount?: number | undefined;
    dailyNotes?: string | null | undefined;
    silInflation?: number | undefined;
}>;
export type TimesheetEntry = z.infer<typeof TimesheetEntrySchema>;
export declare const SubmitTimesheetRequestSchema: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        employeeId: z.ZodString;
        name: z.ZodNullable<z.ZodString>;
        dayType: z.ZodString;
        timeIn: z.ZodNullable<z.ZodString>;
        timeOut: z.ZodNullable<z.ZodString>;
        ninePmReturnsCount: z.ZodDefault<z.ZodNumber>;
        dailyNotes: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        silInflation: z.ZodDefault<z.ZodNumber>;
        storeId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        date: string;
        employeeId: string;
        storeId: string;
        name: string | null;
        dayType: string;
        timeIn: string | null;
        timeOut: string | null;
        ninePmReturnsCount: number;
        dailyNotes: string | null;
        silInflation: number;
    }, {
        date: string;
        employeeId: string;
        storeId: string;
        name: string | null;
        dayType: string;
        timeIn: string | null;
        timeOut: string | null;
        ninePmReturnsCount?: number | undefined;
        dailyNotes?: string | null | undefined;
        silInflation?: number | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    entries: {
        date: string;
        employeeId: string;
        storeId: string;
        name: string | null;
        dayType: string;
        timeIn: string | null;
        timeOut: string | null;
        ninePmReturnsCount: number;
        dailyNotes: string | null;
        silInflation: number;
    }[];
}, {
    entries: {
        date: string;
        employeeId: string;
        storeId: string;
        name: string | null;
        dayType: string;
        timeIn: string | null;
        timeOut: string | null;
        ninePmReturnsCount?: number | undefined;
        dailyNotes?: string | null | undefined;
        silInflation?: number | undefined;
    }[];
}>;
export type SubmitTimesheetRequest = z.infer<typeof SubmitTimesheetRequestSchema>;
export declare const ApproveTimesheetsRequestSchema: z.ZodObject<{
    timesheetIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    timesheetIds: string[];
}, {
    timesheetIds: string[];
}>;
export type ApproveTimesheetsRequest = z.infer<typeof ApproveTimesheetsRequestSchema>;
export declare const SubmitLeaveRequestSchema: z.ZodObject<{
    employeeId: z.ZodString;
    date: z.ZodString;
    leaveType: z.ZodEnum<["holiday", "sick"]>;
    storeId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: string;
    employeeId: string;
    storeId: string;
    leaveType: "holiday" | "sick";
}, {
    date: string;
    employeeId: string;
    storeId: string;
    leaveType: "holiday" | "sick";
}>;
export type SubmitLeaveRequest = z.infer<typeof SubmitLeaveRequestSchema>;
export declare const TimesheetQuerySchema: z.ZodObject<{
    storeId: z.ZodString;
    periodStart: z.ZodString;
    periodEnd: z.ZodString;
}, "strip", z.ZodTypeAny, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
}, {
    storeId: string;
    periodStart: string;
    periodEnd: string;
}>;
export type TimesheetQuery = z.infer<typeof TimesheetQuerySchema>;
//# sourceMappingURL=hr-schemas.d.ts.map