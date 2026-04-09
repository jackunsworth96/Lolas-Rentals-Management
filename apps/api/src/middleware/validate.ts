import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

function sanitizeErrors(error: import('zod').ZodError): unknown {
  if (process.env.NODE_ENV === 'production') {
    return Object.keys(error.flatten().fieldErrors);
  }
  return error.flatten().fieldErrors;
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: sanitizeErrors(result.error),
        },
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: sanitizeErrors(result.error),
        },
      });
      return;
    }

    Object.assign(req.query, result.data as Record<string, unknown>);
    next();
  };
}
