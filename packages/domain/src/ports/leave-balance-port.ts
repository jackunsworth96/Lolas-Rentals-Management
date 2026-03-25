export interface LeaveBalance {
  holidayAllowance: number;
  holidayUsed: number;
  sickAllowance: number;
  sickUsed: number;
}

export interface LeaveBalancePort {
  getBalance(employeeId: string): Promise<LeaveBalance>;
  deductLeave(
    employeeId: string,
    type: 'holiday' | 'sick',
    days: number,
  ): Promise<void>;
  resetAnnualLeave(storeId: string): Promise<void>;
}
