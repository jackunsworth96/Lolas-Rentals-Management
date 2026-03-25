import type { Request, Response, NextFunction } from 'express';
import {
  DomainError,
  InvalidStatusTransitionError,
  UnbalancedTransactionError,
  InsufficientLeaveBalanceError,
  InvalidAmountError,
  NonRentableVehicleError,
} from '@lolas/domain';

const domainStatusMap = new Map<Function, number>([
  [InvalidStatusTransitionError, 409],
  [UnbalancedTransactionError, 422],
  [InsufficientLeaveBalanceError, 409],
  [InvalidAmountError, 400],
  [NonRentableVehicleError, 409],
]);

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DomainError) {
    const status = domainStatusMap.get(err.constructor) ?? 400;
    res.status(status).json({
      success: false,
      error: { code: err.name, message: err.message },
    });
    return;
  }

  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
  });
}
