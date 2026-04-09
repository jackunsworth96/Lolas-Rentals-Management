import { Money } from '../value-objects/money.js';
import { InvalidStatusTransitionError, DomainError } from '../errors/domain-error.js';

type MaintenanceStatus = 'Reported' | 'In Progress' | 'Completed';

export interface MaintenanceRecordProps {
  id: string;
  assetId: string;
  vehicleName: string | null;
  status: MaintenanceStatus;
  downtimeTracked: boolean;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  totalDowntimeDays: number | null;
  issueDescription: string | null;
  workPerformed: string | null;
  partsReplaced: unknown | null;
  partsCost: Money;
  laborCost: Money;
  totalCost: Money;
  paidFrom: string | null;
  mechanic: string | null;
  odometer: number | null;
  nextServiceDue: number | null;
  nextServiceDueDate: string | null;
  opsNotes: string | null;
  employeeId: string | null;
  storeId: string;
  createdAt: Date;
  expenseStatus?: string;
}

export class MaintenanceRecord {
  readonly id: string;
  readonly assetId: string;
  readonly vehicleName: string | null;
  readonly downtimeTracked: boolean;
  readonly downtimeStart: string | null;
  readonly downtimeEnd: string | null;
  readonly totalDowntimeDays: number | null;
  readonly issueDescription: string | null;
  readonly partsReplaced: unknown | null;
  readonly paidFrom: string | null;
  readonly mechanic: string | null;
  readonly odometer: number | null;
  readonly nextServiceDue: number | null;
  readonly nextServiceDueDate: string | null;
  readonly opsNotes: string | null;
  readonly employeeId: string | null;
  readonly storeId: string;
  readonly createdAt: Date;
  readonly expenseStatus?: string;

  private _status: MaintenanceStatus;
  private _workPerformed: string | null;
  private _partsCost: Money;
  private _laborCost: Money;
  private _totalCost: Money;

  private constructor(props: MaintenanceRecordProps) {
    this.id = props.id;
    this.assetId = props.assetId;
    this.vehicleName = props.vehicleName;
    this.downtimeTracked = props.downtimeTracked;
    this.downtimeStart = props.downtimeStart;
    this.downtimeEnd = props.downtimeEnd;
    this.totalDowntimeDays = props.totalDowntimeDays;
    this.issueDescription = props.issueDescription;
    this.partsReplaced = props.partsReplaced;
    this.paidFrom = props.paidFrom;
    this.mechanic = props.mechanic;
    this.odometer = props.odometer;
    this.nextServiceDue = props.nextServiceDue;
    this.nextServiceDueDate = props.nextServiceDueDate;
    this.opsNotes = props.opsNotes;
    this.employeeId = props.employeeId;
    this.storeId = props.storeId;
    this.createdAt = props.createdAt;
    this.expenseStatus = props.expenseStatus;

    this._status = props.status;
    this._workPerformed = props.workPerformed;
    this._partsCost = props.partsCost;
    this._laborCost = props.laborCost;
    this._totalCost = props.totalCost;
  }

  get status(): MaintenanceStatus { return this._status; }
  get workPerformed(): string | null { return this._workPerformed; }
  get partsCost(): Money { return this._partsCost; }
  get laborCost(): Money { return this._laborCost; }
  get totalCost(): Money { return this._totalCost; }

  static create(props: MaintenanceRecordProps): MaintenanceRecord {
    return new MaintenanceRecord(props);
  }

  startWork(): void {
    if (this._status !== 'Reported') {
      throw new InvalidStatusTransitionError(this._status, 'In Progress');
    }
    this._status = 'In Progress';
  }

  complete(workPerformed: string): void {
    if (this._status === 'Completed') {
      throw new InvalidStatusTransitionError(this._status, 'Completed');
    }
    if (!workPerformed || workPerformed.trim().length === 0) {
      throw new DomainError('Work performed description is required to complete maintenance');
    }
    this._workPerformed = workPerformed;
    this._status = 'Completed';
  }

  calculateTotalCost(): Money {
    return this._partsCost.add(this._laborCost);
  }
}
