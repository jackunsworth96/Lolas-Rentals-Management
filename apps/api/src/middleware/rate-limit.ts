import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
