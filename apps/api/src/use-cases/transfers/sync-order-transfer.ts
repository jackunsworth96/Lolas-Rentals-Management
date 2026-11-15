import type { OrderRepository, TransferRepository } from '@lolas/domain';

/**
 * When a transfer fare is billed through a rental order, the customer pays it as
 * part of the order balance. Once the order is fully paid, mark the transfer paid
 * by Lola's so it moves to driver settlement. No journal entry: the order payment
 * already moved the money out of the receivable.
 */
export async function syncOrderTransferPayment(
  orderId: string,
  deps: { orderRepo: OrderRepository; transferRepo: TransferRepository },
): Promise<void> {
  const transfer = await deps.transferRepo.findByOrderId(orderId);
  if (!transfer || !transfer.billedToOrder || transfer.status === 'cancelled') return;
  const due = transfer.balanceDue();
  if (due <= 0) return;

  const order = await deps.orderRepo.findById(orderId);
  if (!order || order.balanceDue.toNumber() > 0.005) return;

  await deps.transferRepo.save(transfer.withPaymentReceived(due, 'lolas', null));
}
