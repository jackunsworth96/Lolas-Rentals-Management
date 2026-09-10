export function calculateBalanceDue(finalTotal: number, totalPaid: number): number {
  return Math.max(0, finalTotal - totalPaid);
}
