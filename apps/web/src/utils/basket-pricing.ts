import type { PublicPartnerBenefit } from '../api/partners.js';
import type { BasketItem } from '../stores/bookingStore.js';
import type { Addon } from '../components/basket/basket-types.js';
import { computePartnerLineBenefit, type AppliedPartnerBenefit } from './partnerDiscount.js';

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addonCost(addon: Addon, rentalDays: number): number {
  return addon.addonType === 'per_day' ? addon.pricePerDay * rentalDays : addon.priceOneTime;
}

export interface BasketPricingTotals {
  vehicleSubtotal: number;
  addonsTotal: number;
  pickupFee: number;
  dropoffFee: number;
  rentalDiscount: number;
  deliveryDiscount: number;
  surchargeAmount: number;
  transferFee: number;
  charityDonation: number;
  deposit: number;
  grandTotal: number;
  appliedPartnerBenefit: AppliedPartnerBenefit;
}

export function calculateBasketPricing(args: {
  basket: BasketItem[];
  rentalDays: number;
  addons: Addon[];
  selectedAddonIds: Set<number>;
  pickupFeePerVehicle: number;
  dropoffFeePerVehicle: number;
  pickupDatetime: string;
  pickupLocationId: number;
  dropoffLocationId: number;
  surchargePercent: number;
  transferFee: number;
  charityDonation: number;
  partnerBenefit: PublicPartnerBenefit | null;
  now?: Date;
}): BasketPricingTotals {
  const selectedAddons = args.addons.filter((addon) => args.selectedAddonIds.has(Number(addon.id)));
  const addonTotalPerVehicle = roundMoney(selectedAddons.reduce(
    (sum, addon) => sum + addonCost(addon, args.rentalDays),
    0,
  ));

  let vehicleSubtotal = 0;
  let rentalDiscount = 0;
  let deliveryDiscount = 0;
  let taxableTotal = 0;
  let surchargeAmount = 0;
  let anyApplied = false;
  let anyFreeDelivery = false;
  let anyEarlyBird = false;
  let pendingReason: AppliedPartnerBenefit['pendingReason'] = null;
  let daysShort = 0;

  for (const item of args.basket) {
    const rentalSubtotal = roundMoney(item.dailyRate * args.rentalDays);
    const benefit = computePartnerLineBenefit({
      benefit: args.partnerBenefit,
      rentalSubtotal,
      pickupFee: args.pickupFeePerVehicle,
      dropoffFee: args.dropoffFeePerVehicle,
      pickupDatetime: args.pickupDatetime,
      now: args.now,
      vehicleModelId: item.vehicleModelId,
      pickupLocationId: args.pickupLocationId,
      dropoffLocationId: args.dropoffLocationId,
    });
    const taxableLine = roundMoney(
      benefit.adjustedRentalSubtotal + addonTotalPerVehicle + benefit.adjustedPickupFee + benefit.adjustedDropoffFee,
    );

    vehicleSubtotal = roundMoney(vehicleSubtotal + rentalSubtotal);
    rentalDiscount = roundMoney(rentalDiscount + benefit.rentalDiscount);
    deliveryDiscount = roundMoney(deliveryDiscount + benefit.deliveryDiscount);
    taxableTotal = roundMoney(taxableTotal + taxableLine);
    surchargeAmount = roundMoney(
      surchargeAmount + roundMoney(taxableLine * (args.surchargePercent / 100)),
    );
    anyApplied ||= benefit.applied;
    anyFreeDelivery ||= benefit.freeDelivery;
    anyEarlyBird ||= benefit.earlyBird;
    if (benefit.pendingReason) {
      pendingReason = benefit.pendingReason;
      daysShort = Math.max(daysShort, benefit.daysShort);
    }
  }

  const transferFee = roundMoney(args.transferFee);
  const charityDonation = roundMoney(args.charityDonation);
  return {
    vehicleSubtotal,
    addonsTotal: roundMoney(addonTotalPerVehicle * args.basket.length),
    pickupFee: roundMoney(args.pickupFeePerVehicle * args.basket.length),
    dropoffFee: roundMoney(args.dropoffFeePerVehicle * args.basket.length),
    rentalDiscount,
    deliveryDiscount,
    surchargeAmount,
    transferFee,
    charityDonation,
    deposit: roundMoney(args.basket.reduce((sum, item) => sum + (item.securityDeposit ?? 0), 0)),
    grandTotal: roundMoney(taxableTotal + surchargeAmount + transferFee + charityDonation),
    appliedPartnerBenefit: {
      applied: anyApplied,
      pendingReason,
      daysShort,
      rentalDiscount,
      freeDelivery: anyFreeDelivery,
      earlyBird: anyEarlyBird,
    },
  };
}
