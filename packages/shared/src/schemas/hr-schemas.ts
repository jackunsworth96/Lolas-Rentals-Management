import { z } from 'zod';

export const TimesheetEntrySchema = z.object({
  date: z.string(),
  employeeId: z.string(),
  name: z.string().nullable(),
  dayType: z.string(),
  timeIn: z.string().nullable(),
  timeOut: z.string().nullable(),
  ninePmReturnsCount: z.number().int().nonnegative().default(0),
  dailyNotes: z.string().nullable().default(null),
  silInflation: z.number().nonnegative().default(0),
  storeId: z.string(),
});

export type TimesheetEntry = z.infer<typeof TimesheetEntrySchema>;

export const SubmitTimesheetRequestSchema = z.object({
  entries: z.array(TimesheetEntrySchema).min(1),
});

export type SubmitTimesheetRequest = z.infer<typeof SubmitTimesheetRequestSchema>;

export const ApproveTimesheetsRequestSchema = z.object({
  timesheetIds: z.array(z.string()).min(1),
});

export type ApproveTimesheetsRequest = z.infer<typeof ApproveTimesheetsRequestSchema>;

export const SubmitLeaveRequestSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  leaveType: z.enum(['holiday', 'sick']),
  storeId: z.string(),
});

export type SubmitLeaveRequest = z.infer<typeof SubmitLeaveRequestSchema>;

export const TimesheetQuerySchema = z.object({
  storeId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export type TimesheetQuery = z.infer<typeof TimesheetQuerySchema>;
