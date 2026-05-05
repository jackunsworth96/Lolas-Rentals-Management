/** Dynamic import so local/dev machines without SENTRY_DSN never load the SDK (avoids a hard hang seen on some Windows setups). */
export async function initSentry(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.2,
    release: process.env.RENDER_GIT_COMMIT ?? undefined,
  });
}
