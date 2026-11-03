import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { INVALID_WHATSAPP_NUMBER, WHATSAPP_NUMBER_ERROR_MESSAGE } from '@lolas/shared';

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
      const invalidWhatsApp = result.error.issues.some(
        (issue) => issue.code === 'custom' && issue.params?.code === INVALID_WHATSAPP_NUMBER,
      );
      res.status(400).json({
        success: false,
        error: {
          code: invalidWhatsApp ? INVALID_WHATSAPP_NUMBER : 'VALIDATION_ERROR',
          message: invalidWhatsApp ? WHATSAPP_NUMBER_ERROR_MESSAGE : 'Invalid request body',
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
