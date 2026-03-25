import { NonRentableVehicleError } from '../errors/domain-error.js';

const PROTECTED_STATUSES = ['Sold', 'Closed', 'Service Vehicle'] as const;

const NON_RENTABLE_STATUSES = ['Sold', 'Closed', 'Maintenance', 'Retired'] as const;

export interface VehicleProps {
  id: string;
  storeId: string;
  name: string;
  modelId: string | null;
  plateNumber: string | null;
  gpsId: string | null;
  status: string;
  currentMileage: number;
  orcrExpiryDate: string | null;
  surfRack: boolean;
  owner: string | null;
  rentableStartDate: string | null;
  registrationDate: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  setUpCosts: number;
  totalBikeCost: number;
  usefulLifeMonths: number | null;
  salvageValue: number;
  accumulatedDepreciation: number;
  bookValue: number;
  dateSold: string | null;
  soldPrice: number | null;
  profitLoss: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Vehicle {
  readonly id: string;
  readonly storeId: string;
  readonly name: string;
  readonly modelId: string | null;
  readonly plateNumber: string | null;
  readonly gpsId: string | null;
  readonly currentMileage: number;
  readonly orcrExpiryDate: string | null;
  readonly surfRack: boolean;
  readonly owner: string | null;
  readonly rentableStartDate: string | null;
  readonly registrationDate: string | null;
  readonly purchasePrice: number | null;
  readonly purchaseDate: string | null;
  readonly setUpCosts: number;
  readonly totalBikeCost: number;
  readonly usefulLifeMonths: number | null;
  readonly salvageValue: number;
  readonly dateSold: string | null;
  readonly soldPrice: number | null;
  readonly profitLoss: number | null;
  readonly createdAt: Date;

  private _status: string;
  private _accumulatedDepreciation: number;
  private _bookValue: number;
  private _updatedAt: Date;

  private constructor(props: VehicleProps) {
    this.id = props.id;
    this.storeId = props.storeId;
    this.name = props.name;
    this.modelId = props.modelId;
    this.plateNumber = props.plateNumber;
    this.gpsId = props.gpsId;
    this.currentMileage = props.currentMileage;
    this.orcrExpiryDate = props.orcrExpiryDate;
    this.surfRack = props.surfRack;
    this.owner = props.owner;
    this.rentableStartDate = props.rentableStartDate;
    this.registrationDate = props.registrationDate;
    this.purchasePrice = props.purchasePrice;
    this.purchaseDate = props.purchaseDate;
    this.setUpCosts = props.setUpCosts;
    this.totalBikeCost = props.totalBikeCost;
    this.usefulLifeMonths = props.usefulLifeMonths;
    this.salvageValue = props.salvageValue;
    this.dateSold = props.dateSold;
    this.soldPrice = props.soldPrice;
    this.profitLoss = props.profitLoss;
    this.createdAt = props.createdAt;

    this._status = props.status;
    this._accumulatedDepreciation = props.accumulatedDepreciation;
    this._bookValue = props.bookValue;
    this._updatedAt = props.updatedAt;
  }

  get status(): string { return this._status; }
  get accumulatedDepreciation(): number { return this._accumulatedDepreciation; }
  get bookValue(): number { return this._bookValue; }
  get updatedAt(): Date { return this._updatedAt; }

  static create(props: VehicleProps): Vehicle {
    return new Vehicle(props);
  }

  isRentable(): boolean {
    return !(NON_RENTABLE_STATUSES as readonly string[]).includes(this._status);
  }

  isProtected(): boolean {
    return (PROTECTED_STATUSES as readonly string[]).includes(this._status);
  }

  canAutoUpdateStatus(): boolean {
    return !this.isProtected();
  }

  applyDepreciation(amount: number): void {
    if (this.isProtected()) {
      throw new NonRentableVehicleError(
        this.id,
        `Cannot depreciate: status '${this._status}'`,
      );
    }
    this._accumulatedDepreciation += amount;
    this._bookValue = this.totalBikeCost - this._accumulatedDepreciation;
    if (this._bookValue < this.salvageValue) {
      this._bookValue = this.salvageValue;
      this._accumulatedDepreciation = this.totalBikeCost - this.salvageValue;
    }
    this._updatedAt = new Date();
  }
}
