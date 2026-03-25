import { InvalidStatusTransitionError } from '../errors/domain-error.js';

const LEAVE_DAY_TYPES = ['Holiday', 'Sick'] as const;

type PayrollStatus = 'Pending' | 'Approved' | 'Paid';

const PAYROLL_TRANSITIONS: Record<PayrollStatus, PayrollStatus | null> = {
  Pending: 'Approved',
  Approved: 'Paid',
  Paid: null,
};

export interface TimesheetProps {
  id: string;
  date: string;
  employeeId: string;
  name: string | null;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  regularHours: number;
  overtimeHours: number;
  ninePmReturnsCount: number;
  dailyNotes: string | null;
  payrollStatus: PayrollStatus;
  silInflation: number;
  storeId: string;
  createdAt: Date;
}

export class Timesheet {
  readonly id: string;
  readonly date: string;
  readonly employeeId: string;
  readonly name: string | null;
  readonly dayType: string;
  readonly ninePmReturnsCount: number;
  readonly dailyNotes: string | null;
  readonly silInflation: number;
  readonly storeId: string;
  readonly createdAt: Date;

  private _timeIn: string | null;
  private _timeOut: string | null;
  private _regularHours: number;
  private _overtimeHours: number;
  private _payrollStatus: PayrollStatus;

  private constructor(props: TimesheetProps) {
    this.id = props.id;
    this.date = props.date;
    this.employeeId = props.employeeId;
    this.name = props.name;
    this.dayType = props.dayType;
    this.ninePmReturnsCount = props.ninePmReturnsCount;
    this.dailyNotes = props.dailyNotes;
    this.silInflation = props.silInflation;
    this.storeId = props.storeId;
    this.createdAt = props.createdAt;

    this._timeIn = props.timeIn;
    this._timeOut = props.timeOut;
    this._regularHours = props.regularHours;
    this._overtimeHours = props.overtimeHours;
    this._payrollStatus = props.payrollStatus;
  }

  get timeIn(): string | null { return this._timeIn; }
  get timeOut(): string | null { return this._timeOut; }
  get regularHours(): number { return this._regularHours; }
  get overtimeHours(): number { return this._overtimeHours; }
  get payrollStatus(): PayrollStatus { return this._payrollStatus; }

  static create(props: TimesheetProps): Timesheet {
    if ((LEAVE_DAY_TYPES as readonly string[]).includes(props.dayType)) {
      return new Timesheet({
        ...props,
        timeIn: null,
        timeOut: null,
        regularHours: 8,
        overtimeHours: 0,
      });
    }
    return new Timesheet(props);
  }

  approve(): void {
    this.transitionStatus('Approved');
  }

  markPaid(): void {
    this.transitionStatus('Paid');
  }

  isLeaveDay(): boolean {
    return (LEAVE_DAY_TYPES as readonly string[]).includes(this.dayType);
  }

  /**
   * Splits total worked hours: first 8 go to regular, excess to overtime.
   */
  static calculateHours(
    timeIn: string,
    timeOut: string,
  ): { regularHours: number; overtimeHours: number } {
    const inMs = parseTimeToMinutes(timeIn);
    const outMs = parseTimeToMinutes(timeOut);
    const totalMinutes = outMs > inMs ? outMs - inMs : outMs + 1440 - inMs;
    const totalHours = totalMinutes / 60;

    const MAX_REGULAR = 8;
    const regular = Math.min(totalHours, MAX_REGULAR);
    const overtime = Math.max(totalHours - MAX_REGULAR, 0);

    return {
      regularHours: Math.round(regular * 100) / 100,
      overtimeHours: Math.round(overtime * 100) / 100,
    };
  }

  private transitionStatus(target: PayrollStatus): void {
    const allowed = PAYROLL_TRANSITIONS[this._payrollStatus];
    if (allowed !== target) {
      throw new InvalidStatusTransitionError(this._payrollStatus, target);
    }
    this._payrollStatus = target;
  }
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}
