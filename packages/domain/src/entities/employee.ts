import { InsufficientLeaveBalanceError } from '../errors/domain-error.js';

export interface EmployeeProps {
  id: string;
  storeId: string | null;
  fullName: string;
  role: string | null;
  status: string;
  birthday: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  startDate: string | null;
  probationEndDate: string | null;
  rateType: string | null;
  basicRate: number;
  overtimeRate: number;
  ninePmBonusRate: number;
  commissionRate: number;
  paidAs: string | null;
  defaultPaymentMethod: string;
  monthlyBikeAllowance: number;
  bikeAllowanceUsed: number;
  bikeAllowanceAccrued: number;
  availableBalance: number;
  thirteenthMonthAccrued: number;
  currentCashAdvance: number;
  holidayAllowance: number;
  holidayUsed: number;
  sickAllowance: number;
  sickUsed: number;
  sssNo: string | null;
  philhealthNo: string | null;
  pagibigNo: string | null;
  tin: string | null;
  sssDeductionAmt: number;
  philhealthDeductionAmt: number;
  pagibigDeductionAmt: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Employee {
  readonly id: string;
  readonly storeId: string | null;
  readonly fullName: string;
  readonly role: string | null;
  readonly status: string;
  readonly birthday: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactNumber: string | null;
  readonly startDate: string | null;
  readonly probationEndDate: string | null;
  readonly rateType: string | null;
  readonly basicRate: number;
  readonly overtimeRate: number;
  readonly ninePmBonusRate: number;
  readonly commissionRate: number;
  readonly paidAs: string | null;
  readonly defaultPaymentMethod: string;
  readonly monthlyBikeAllowance: number;
  readonly thirteenthMonthAccrued: number;
  readonly currentCashAdvance: number;
  readonly sssNo: string | null;
  readonly philhealthNo: string | null;
  readonly pagibigNo: string | null;
  readonly tin: string | null;
  readonly sssDeductionAmt: number;
  readonly philhealthDeductionAmt: number;
  readonly pagibigDeductionAmt: number;
  readonly createdAt: Date;

  private _bikeAllowanceUsed: number;
  private _bikeAllowanceAccrued: number;
  private _availableBalance: number;
  private _holidayAllowance: number;
  private _holidayUsed: number;
  private _sickAllowance: number;
  private _sickUsed: number;
  private _updatedAt: Date;

  private constructor(props: EmployeeProps) {
    this.id = props.id;
    this.storeId = props.storeId;
    this.fullName = props.fullName;
    this.role = props.role;
    this.status = props.status;
    this.birthday = props.birthday;
    this.emergencyContactName = props.emergencyContactName;
    this.emergencyContactNumber = props.emergencyContactNumber;
    this.startDate = props.startDate;
    this.probationEndDate = props.probationEndDate;
    this.rateType = props.rateType;
    this.basicRate = props.basicRate;
    this.overtimeRate = props.overtimeRate;
    this.ninePmBonusRate = props.ninePmBonusRate;
    this.commissionRate = props.commissionRate;
    this.paidAs = props.paidAs;
    this.defaultPaymentMethod = props.defaultPaymentMethod ?? 'cash';
    this.monthlyBikeAllowance = props.monthlyBikeAllowance;
    this.thirteenthMonthAccrued = props.thirteenthMonthAccrued;
    this.currentCashAdvance = props.currentCashAdvance;
    this.sssNo = props.sssNo;
    this.philhealthNo = props.philhealthNo;
    this.pagibigNo = props.pagibigNo;
    this.tin = props.tin;
    this.sssDeductionAmt = props.sssDeductionAmt;
    this.philhealthDeductionAmt = props.philhealthDeductionAmt;
    this.pagibigDeductionAmt = props.pagibigDeductionAmt;
    this.createdAt = props.createdAt;

    this._bikeAllowanceUsed = props.bikeAllowanceUsed;
    this._bikeAllowanceAccrued = props.bikeAllowanceAccrued;
    this._availableBalance = props.availableBalance;
    this._holidayAllowance = props.holidayAllowance;
    this._holidayUsed = props.holidayUsed;
    this._sickAllowance = props.sickAllowance;
    this._sickUsed = props.sickUsed;
    this._updatedAt = props.updatedAt;
  }

  get bikeAllowanceUsed(): number { return this._bikeAllowanceUsed; }
  get bikeAllowanceAccrued(): number { return this._bikeAllowanceAccrued; }
  get availableBalance(): number { return this._availableBalance; }
  get holidayAllowance(): number { return this._holidayAllowance; }
  get holidayUsed(): number { return this._holidayUsed; }
  get sickAllowance(): number { return this._sickAllowance; }
  get sickUsed(): number { return this._sickUsed; }
  get updatedAt(): Date { return this._updatedAt; }

  static create(props: EmployeeProps): Employee {
    return new Employee(props);
  }

  canTakeLeave(type: 'holiday' | 'sick'): boolean {
    return this.getRemainingLeave(type) > 0;
  }

  deductLeave(type: 'holiday' | 'sick', days: number): void {
    const remaining = this.getRemainingLeave(type);
    if (days > remaining) {
      throw new InsufficientLeaveBalanceError(remaining, days, type);
    }
    if (type === 'holiday') {
      this._holidayUsed += days;
    } else {
      this._sickUsed += days;
    }
    this._updatedAt = new Date();
  }

  getRemainingLeave(type: 'holiday' | 'sick'): number {
    if (type === 'holiday') {
      return this._holidayAllowance - this._holidayUsed;
    }
    return this._sickAllowance - this._sickUsed;
  }
}
