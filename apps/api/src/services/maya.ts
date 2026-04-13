import crypto from 'crypto';

const MAYA_BASE_URL = 'https://pg.maya.ph';

export interface MayaCheckoutParams {
  orderId: string;
  orderReference: string;
  amountInCentavos: number;
  description: string;
  redirectSuccess: string;
  redirectFailure: string;
  redirectCancel: string;
}

export interface MayaCheckoutResult {
  checkoutId: string;
  redirectUrl: string;
}

export interface MayaWebhookPayload {
  checkoutId: string;
  requestReferenceNumber: string;
  status: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_EXPIRED' | string;
  totalAmount: {
    value: number;
    currency: string;
  };
  createdAt: string;
  updatedAt: string;
}

export async function createMayaCheckout(
  params: MayaCheckoutParams,
): Promise<MayaCheckoutResult> {
  const secretKey = process.env.MAYA_SECRET_KEY;
  if (!secretKey) {
    throw new Error('MAYA_SECRET_KEY environment variable is not set');
  }

  const credentials = Buffer.from(`${secretKey}:`).toString('base64');

  const response = await fetch(`${MAYA_BASE_URL}/checkout/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      totalAmount: {
        value: params.amountInCentavos / 100,
        currency: 'PHP',
      },
      requestReferenceNumber: params.orderId,
      redirectUrl: {
        success: params.redirectSuccess,
        failure: params.redirectFailure,
        cancel: params.redirectCancel,
      },
      metadata: {
        orderReference: params.orderReference,
      },
    }),
  });

  if (response.status !== 201) {
    let message = `Maya API error: ${response.status} ${response.statusText}`;
    let errorDetail = '';
    try {
      const errorBody = await response.json();
      errorDetail = JSON.stringify(errorBody);
      if ((errorBody as { message?: string }).message) {
        message = `Maya API error: ${(errorBody as { message?: string }).message}`;
      }
    } catch {
      // ignore JSON parse failure
    }
    console.error('[Maya] API error response:', errorDetail);
    console.error('[Maya] Request URL:', `${MAYA_BASE_URL}/checkout/v1/checkouts`);
    console.error('[Maya] Secret key prefix:', process.env.MAYA_SECRET_KEY?.slice(0, 10));
    throw new Error(message);
  }

  const data = (await response.json()) as {
    checkoutId: string;
    redirectUrl: string;
  };

  return {
    checkoutId: data.checkoutId,
    redirectUrl: data.redirectUrl,
  };
}

export function verifyMayaWebhook(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env.MAYA_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('MAYA_WEBHOOK_SECRET environment variable is not set');
  }

  const computed = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const computedBuffer = Buffer.from(computed, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');

  if (computedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
}

export function parseMayaWebhookPayload(body: unknown): MayaWebhookPayload {
  return body as MayaWebhookPayload;
}
