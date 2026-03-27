import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Log PostgREST / Supabase errors in a structured way for production debugging (e.g. Render).
 * Never log secrets, PINs, or tokens.
 */
export function logSupabaseError(context: string, error: PostgrestError | null | undefined): void {
  if (!error) return;
  console.error(`[${context}] Supabase/PostgREST error`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

/** Log any Error (and optional cause) for API routes before rethrowing or mapping to HTTP. */
export function logRouteError(context: string, err: unknown): void {
  if (err instanceof Error) {
    console.error(`[${context}]`, {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause instanceof Error ? { message: err.cause.message, stack: err.cause.stack } : err.cause,
    });
    return;
  }
  console.error(`[${context}]`, err);
}
