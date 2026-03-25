import {
  Timesheet,
  DomainError,
  type TimesheetProps,
  type TimesheetRepository,
  type LeaveBalancePort,
  type EmployeeRepository,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface SubmitLeaveInput {
  employeeId: string;
  date: string;
  leaveType: 'holiday' | 'sick';
  storeId: string;
}

export interface SubmitLeaveResult {
  timesheetId: string;
  remainingBalance: number;
}

export async function submitLeave(
  input: SubmitLeaveInput,
  deps: {
    employees: EmployeeRepository;
    timesheets: TimesheetRepository;
    leaveBalance: LeaveBalancePort;
  },
): Promise<SubmitLeaveResult> {
  const employee = await deps.employees.findById(input.employeeId);
  if (!employee) {
    throw new DomainError(`Employee ${input.employeeId} not found`);
  }

  const balance = await deps.leaveBalance.getBalance(input.employeeId);

  const remaining =
    input.leaveType === 'holiday'
      ? balance.holidayAllowance - balance.holidayUsed
      : balance.sickAllowance - balance.sickUsed;

  if (remaining < 1) {
    throw new DomainError(
      `Insufficient ${input.leaveType} leave: ${remaining} days remaining`,
    );
  }

  const dayType = input.leaveType === 'holiday' ? 'Holiday' : 'Sick';

  const props: TimesheetProps = {
    id: randomUUID(),
    date: input.date,
    employeeId: input.employeeId,
    name: employee.fullName,
    dayType,
    timeIn: null,
    timeOut: null,
    regularHours: 0,
    overtimeHours: 0,
    ninePmReturnsCount: 0,
    dailyNotes: `${dayType} leave`,
    payrollStatus: 'Pending',
    silInflation: 0,
    storeId: input.storeId,
    createdAt: new Date(),
  };

  const timesheet = Timesheet.create(props);

  await deps.leaveBalance.deductLeave(input.employeeId, input.leaveType, 1);
  await deps.timesheets.save(timesheet);

  return {
    timesheetId: timesheet.id,
    remainingBalance: remaining - 1,
  };
}
