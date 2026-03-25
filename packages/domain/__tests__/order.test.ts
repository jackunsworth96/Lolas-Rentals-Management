import { describe, it, expect } from 'vitest';
import { Order, type OrderProps } from '../src/entities/order.js';
import { Money } from '../src/value-objects/money.js';
import { OrderStatus } from '../src/value-objects/order-status.js';

function makeOrderProps(overrides: Partial<OrderProps> = {}): OrderProps {
  return {
    id: 'ord-1',
    storeId: 'store-1',
    customerId: 'cust-1',
    employeeId: null,
    orderDate: '2025-03-01',
    status: OrderStatus.Unprocessed,
    webNotes: null,
    quantity: 2,
    webQuoteRaw: null,
    securityDeposit: Money.php(500),
    depositStatus: null,
    cardFeeSurcharge: Money.zero(),
    returnCharges: Money.zero(),
    finalTotal: Money.php(3000),
    balanceDue: Money.php(3000),
    paymentMethodId: null,
    depositMethodId: null,
    bookingToken: null,
    tips: Money.zero(),
    charityDonation: Money.zero(),
    addons: [],
    createdAt: new Date('2025-03-01'),
    updatedAt: new Date('2025-03-01'),
    ...overrides,
  };
}

describe('Order', () => {
  it('creates an order with valid props', () => {
    const order = Order.create(makeOrderProps());
    expect(order.id).toBe('ord-1');
    expect(order.storeId).toBe('store-1');
    expect(order.status.equals(OrderStatus.Unprocessed)).toBe(true);
    expect(order.quantity).toBe(2);
    expect(order.finalTotal.amount).toBe(3000);
  });

  it('exposes readonly props', () => {
    const order = Order.create(makeOrderProps());
    expect(order.customerId).toBe('cust-1');
    expect(order.orderDate).toBe('2025-03-01');
    expect(order.securityDeposit.amount).toBe(500);
  });

  describe('activate', () => {
    it('activates an unprocessed order with >= 1 vehicle', () => {
      const order = Order.create(makeOrderProps());
      order.activate('emp-1', 2);
      expect(order.status.equals(OrderStatus.Active)).toBe(true);
      expect(order.employeeId).toBe('emp-1');
    });

    it('refuses activation with 0 vehicles', () => {
      const order = Order.create(makeOrderProps());
      expect(() => order.activate('emp-1', 0)).toThrow();
    });

    it('refuses activation from a terminal state', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Completed }),
      );
      expect(() => order.activate('emp-1', 1)).toThrow();
    });
  });

  describe('settle', () => {
    it('settles an active order', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Active }),
      );
      order.settle();
      expect(order.status.equals(OrderStatus.Completed)).toBe(true);
    });

    it('settles a confirmed order', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Confirmed }),
      );
      order.settle();
      expect(order.status.equals(OrderStatus.Completed)).toBe(true);
    });

    it('refuses settle from unprocessed', () => {
      const order = Order.create(makeOrderProps());
      expect(() => order.settle()).toThrow();
    });

    it('refuses settle from cancelled', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Cancelled }),
      );
      expect(() => order.settle()).toThrow();
    });
  });

  describe('cancel', () => {
    it('cancels an unprocessed order', () => {
      const order = Order.create(makeOrderProps());
      order.cancel();
      expect(order.status.equals(OrderStatus.Cancelled)).toBe(true);
    });

    it('cancels an active order', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Active }),
      );
      order.cancel();
      expect(order.status.equals(OrderStatus.Cancelled)).toBe(true);
    });

    it('cancels a confirmed order', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Confirmed }),
      );
      order.cancel();
      expect(order.status.equals(OrderStatus.Cancelled)).toBe(true);
    });

    it('refuses cancel from completed', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Completed }),
      );
      expect(() => order.cancel()).toThrow();
    });

    it('refuses cancel from already cancelled', () => {
      const order = Order.create(
        makeOrderProps({ status: OrderStatus.Cancelled }),
      );
      expect(() => order.cancel()).toThrow();
    });
  });

  describe('addons', () => {
    it('adds an addon', () => {
      const order = Order.create(makeOrderProps());
      order.addAddon({
        addonName: 'GPS',
        addonPrice: 200,
        addonType: 'one_time',
        quantity: 1,
        totalAmount: 200,
      });
      expect(order.addons).toHaveLength(1);
      expect(order.addons[0].addonName).toBe('GPS');
    });

    it('replaces addon in same mutual exclusivity group', () => {
      const order = Order.create(makeOrderProps());
      order.addAddon({
        addonName: 'Insurance A',
        addonPrice: 100,
        addonType: 'per_day',
        quantity: 1,
        totalAmount: 100,
        mutualExclusivityGroup: 'insurance',
      });
      order.addAddon({
        addonName: 'Insurance B',
        addonPrice: 200,
        addonType: 'per_day',
        quantity: 1,
        totalAmount: 200,
        mutualExclusivityGroup: 'insurance',
      });
      expect(order.addons).toHaveLength(1);
      expect(order.addons[0].addonName).toBe('Insurance B');
    });

    it('keeps addons in different groups', () => {
      const order = Order.create(makeOrderProps());
      order.addAddon({
        addonName: 'Insurance',
        addonPrice: 100,
        addonType: 'per_day',
        quantity: 1,
        totalAmount: 100,
        mutualExclusivityGroup: 'insurance',
      });
      order.addAddon({
        addonName: 'Helmet',
        addonPrice: 50,
        addonType: 'one_time',
        quantity: 1,
        totalAmount: 50,
        mutualExclusivityGroup: 'gear',
      });
      expect(order.addons).toHaveLength(2);
    });
  });

  describe('calculateBalanceDue', () => {
    it('returns finalTotal minus payments', () => {
      const order = Order.create(makeOrderProps({ finalTotal: Money.php(3000) }));
      const balance = order.calculateBalanceDue(Money.php(1000));
      expect(balance.amount).toBe(2000);
    });

    it('returns zero when fully paid', () => {
      const order = Order.create(makeOrderProps({ finalTotal: Money.php(3000) }));
      const balance = order.calculateBalanceDue(Money.php(3000));
      expect(balance.isZero()).toBe(true);
    });

    it('returns negative when overpaid', () => {
      const order = Order.create(makeOrderProps({ finalTotal: Money.php(3000) }));
      const balance = order.calculateBalanceDue(Money.php(3500));
      expect(balance.isNegative()).toBe(true);
    });
  });
});
