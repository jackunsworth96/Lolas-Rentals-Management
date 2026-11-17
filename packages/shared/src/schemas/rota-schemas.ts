import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const ROTA_CELL_KINDS = ['working', 'day_off', 'holiday', 'sick', 'unpaid_leave', 'out_of_office'] as const;
export type RotaCellKind = (typeof ROTA_CELL_KINDS)[number];

export const ROTA_SCHEDULE_MODES = ['rostered', 'self_managed', 'excluded'] as const;
export type RotaScheduleMode = (typeof ROTA_SCHEDULE_MODES)[number];

export const SaveDayOffPicksSchema = z.object({
  /** Monday of the week being picked for. */
  weekStart: isoDate,
  dates: z.array(isoDate).max(7),
  note: z.string().trim().max(500).optional(),
});
export type SaveDayOffPicksRequest = z.infer<typeof SaveDayOffPicksSchema>;

export const DecideDayOffPickSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('decline'), note: z.string().trim().min(1, 'Say why so they can pick another day').max(500) }),
  z.object({ action: z.literal('move'), toDate: isoDate, note: z.string().trim().min(1, 'Say why the day was moved').max(500) }),
]);
export type DecideDayOffPickRequest = z.infer<typeof DecideDayOffPickSchema>;

export const RotaCellEditSchema = z.object({
  employeeId: z.string().min(1),
  date: isoDate,
  /** null resets the cell to the default (working store hours, or the approved pick). */
  kind: z.enum(ROTA_CELL_KINDS).nullable(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  note: z.string().trim().max(200).optional(),
}).refine((c) => !c.startTime || !c.endTime || c.endTime > c.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export const SetRotaCellsSchema = z.object({
  weekStart: isoDate,
  cells: z.array(RotaCellEditSchema).min(1).max(100),
  /** Required when changing a published week; shown to the affected person. */
  reason: z.string().trim().max(300).optional(),
});
export type SetRotaCellsRequest = z.infer<typeof SetRotaCellsSchema>;

export const SetCoverOverrideSchema = z.object({
  date: isoDate,
  /** null removes the emergency override. */
  reason: z.string().trim().min(3, 'Give the emergency reason').max(300).nullable(),
});
export type SetCoverOverrideRequest = z.infer<typeof SetCoverOverrideSchema>;

export const PublishRotaSchema = z.object({ weekStart: isoDate });

export const ROTA_DUTIES = ['nine_pm_return'] as const;
export type RotaDuty = (typeof ROTA_DUTIES)[number];

export const SetRotaDutySchema = z.object({
  date: isoDate,
  duty: z.enum(ROTA_DUTIES),
  /** null removes the assignment. */
  employeeId: z.string().min(1).nullable(),
});
export type SetRotaDutyRequest = z.infer<typeof SetRotaDutySchema>;

export const UpdateRotaSettingsSchema = z.object({
  defaultStart: hhmm,
  defaultEnd: hhmm,
  minStaff: z.number().int().min(1).max(20),
  emergencyMinStaff: z.number().int().min(1).max(20),
  maxOffPerDay: z.number().int().min(0).max(20),
  changeNoticeHours: z.number().int().min(0).max(336),
  approverIds: z.array(z.string().min(1)).min(1, 'Keep at least one approver'),
}).refine((s) => s.defaultEnd > s.defaultStart, { message: 'Closing time must be after opening time', path: ['defaultEnd'] })
  .refine((s) => s.emergencyMinStaff <= s.minStaff, { message: 'Emergency minimum can’t be above the normal minimum', path: ['emergencyMinStaff'] });
export type UpdateRotaSettingsRequest = z.infer<typeof UpdateRotaSettingsSchema>;

export const UpdateWorkPatternSchema = z.object({
  scheduleMode: z.enum(ROTA_SCHEDULE_MODES),
  targetDaysPerWeek: z.number().int().min(1).max(7),
  countsTowardCover: z.boolean(),
});
export type UpdateWorkPatternRequest = z.infer<typeof UpdateWorkPatternSchema>;
