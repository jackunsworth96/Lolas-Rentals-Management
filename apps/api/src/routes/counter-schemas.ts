import { z } from 'zod';
import { WhatsAppNumberSchema } from '@lolas/shared';
import { MAX_COUNTER_DAYS } from '../use-cases/counter/counter-slots.js';

const days = z.coerce.number().int().min(1).max(MAX_COUNTER_DAYS);
const sessionToken = z.string().min(20).max(120);
/** Partner kiosks without a fixed property area: the area the guest chose. */
const deliveryAreaId = z.coerce.number().int().positive();

/** Shared by our counter and partner kiosks; `pickupDatetime` is only used by scheduled (partner) kiosks. */
export const counterQuerySchema = z.object({
  days,
  pickupDatetime: z.string().min(1).optional(),
  sessionToken: sessionToken.optional(),
  deliveryAreaId: deliveryAreaId.optional(),
});

export const CounterHoldSchema = z.object({
  modelId: z.string().min(1),
  days,
  pickupDatetime: z.string().min(1).nullable().optional(),
  sessionToken,
  deliveryAreaId: deliveryAreaId.nullable().optional(),
});

export const CounterReleaseSchema = z.object({ sessionToken });

export const CounterBookingSchema = z.object({
  vehicleModelId: z.string().min(1),
  days,
  pickupDatetime: z.string().min(1).nullable().optional(),
  customerName: z.string().trim().min(1).max(120),
  customerMobile: WhatsAppNumberSchema,
  customerEmail: z.string().trim().email(),
  addonIds: z.array(z.number().int().positive()).max(10).optional(),
  collectionLocationId: z.number().int().positive().nullable().optional(),
  stayingAt: z.string().trim().max(160).nullable().optional(),
  holdId: z.string().uuid().nullable().optional(),
  sessionToken: sessionToken.nullable().optional(),
  deliveryAreaId: deliveryAreaId.nullable().optional(),
});
