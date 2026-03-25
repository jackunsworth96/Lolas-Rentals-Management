import { describe, it, expect } from 'vitest';
import { Transfer, type TransferProps } from '../src/entities/transfer.js';
import {
  MaintenanceRecord,
  type MaintenanceRecordProps,
} from '../src/entities/maintenance-record.js';
import { Money } from '../src/value-objects/money.js';

function makeTransferProps(
  overrides: Partial<TransferProps> = {},
): TransferProps {
  return {
    id: 'xfer-1',
    orderId: null,
    serviceDate: '2025-03-15',
    customerName: 'Maria Santos',
    contactNumber: '09171234567',
    customerEmail: null,
    customerType: 'Walk-in',
    route: 'Airport → Hotel',
    flightTime: '14:00',
    paxCount: 3,
    vanType: 'Standard',
    accommodation: null,
    status: 'Confirmed',
    opsNotes: null,
    totalPrice: Money.php(2500),
    paymentMethod: 'Cash',
    paymentStatus: 'Pending',
    driverFee: Money.php(800),
    netProfit: null,
    driverPaidStatus: null,
    bookingSource: null,
    bookingToken: null,
    storeId: 'store-1',
    createdAt: new Date('2025-03-10'),
    updatedAt: new Date('2025-03-10'),
    ...overrides,
  };
}

function makeMaintenanceProps(
  overrides: Partial<MaintenanceRecordProps> = {},
): MaintenanceRecordProps {
  return {
    id: 'maint-1',
    assetId: 'v-1',
    vehicleName: 'Honda Click 125',
    status: 'Reported',
    downtimeTracked: false,
    downtimeStart: null,
    downtimeEnd: null,
    totalDowntimeDays: null,
    issueDescription: 'Flat tire',
    workPerformed: null,
    partsReplaced: null,
    partsCost: Money.php(500),
    laborCost: Money.php(300),
    totalCost: Money.php(800),
    paidFrom: null,
    mechanic: 'Pedro',
    odometer: 12000,
    nextServiceDue: 15000,
    employeeId: 'emp-1',
    storeId: 'store-1',
    createdAt: new Date('2025-03-01'),
    ...overrides,
  };
}

describe('Transfer', () => {
  describe('derivePaymentStatus', () => {
    it('returns Pending when nothing paid', () => {
      const t = Transfer.create(makeTransferProps());
      expect(t.derivePaymentStatus(Money.zero())).toBe('Pending');
    });

    it('returns Partially Paid for partial payment', () => {
      const t = Transfer.create(
        makeTransferProps({ totalPrice: Money.php(2500) }),
      );
      expect(t.derivePaymentStatus(Money.php(1000))).toBe('Partially Paid');
    });

    it('returns Paid when fully paid', () => {
      const t = Transfer.create(
        makeTransferProps({ totalPrice: Money.php(2500) }),
      );
      expect(t.derivePaymentStatus(Money.php(2500))).toBe('Paid');
    });

    it('returns Paid when overpaid', () => {
      const t = Transfer.create(
        makeTransferProps({ totalPrice: Money.php(2500) }),
      );
      expect(t.derivePaymentStatus(Money.php(3000))).toBe('Paid');
    });

    it('returns Pending for negative payment', () => {
      const t = Transfer.create(makeTransferProps());
      expect(t.derivePaymentStatus(Money.php(-100))).toBe('Pending');
    });
  });

  describe('calculateNetProfit', () => {
    it('subtracts driver fee from total price', () => {
      const t = Transfer.create(
        makeTransferProps({
          totalPrice: Money.php(2500),
          driverFee: Money.php(800),
        }),
      );
      const profit = t.calculateNetProfit();
      expect(profit.amount).toBe(1700);
    });

    it('uses zero when no driver fee', () => {
      const t = Transfer.create(
        makeTransferProps({
          totalPrice: Money.php(2500),
          driverFee: null,
        }),
      );
      const profit = t.calculateNetProfit();
      expect(profit.amount).toBe(2500);
    });
  });
});

describe('MaintenanceRecord', () => {
  describe('status transitions', () => {
    it('transitions Reported → In Progress', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'Reported' }),
      );
      m.startWork();
      expect(m.status).toBe('In Progress');
    });

    it('rejects startWork from In Progress', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'In Progress' }),
      );
      expect(() => m.startWork()).toThrow();
    });

    it('rejects startWork from Completed', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'Completed' }),
      );
      expect(() => m.startWork()).toThrow();
    });

    it('completes from In Progress with work description', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'In Progress' }),
      );
      m.complete('Replaced inner tube and patched tire');
      expect(m.status).toBe('Completed');
      expect(m.workPerformed).toBe('Replaced inner tube and patched tire');
    });

    it('completes from Reported with work description', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'Reported' }),
      );
      m.complete('Quick fix applied');
      expect(m.status).toBe('Completed');
    });

    it('rejects complete from Completed', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'Completed' }),
      );
      expect(() => m.complete('More work')).toThrow();
    });
  });

  describe('complete requires work performed', () => {
    it('throws with empty string', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'In Progress' }),
      );
      expect(() => m.complete('')).toThrow(
        'Work performed description is required',
      );
    });

    it('throws with whitespace-only string', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({ status: 'In Progress' }),
      );
      expect(() => m.complete('   ')).toThrow(
        'Work performed description is required',
      );
    });
  });

  describe('calculateTotalCost', () => {
    it('sums parts and labor costs', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({
          partsCost: Money.php(500),
          laborCost: Money.php(300),
        }),
      );
      const total = m.calculateTotalCost();
      expect(total.amount).toBe(800);
    });

    it('handles zero costs', () => {
      const m = MaintenanceRecord.create(
        makeMaintenanceProps({
          partsCost: Money.zero(),
          laborCost: Money.zero(),
        }),
      );
      expect(m.calculateTotalCost().isZero()).toBe(true);
    });
  });
});
