const vercelEnvironment = process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV;

if (!['preview', 'staging'].includes(vercelEnvironment)) process.exit(0);

const apiUrl = process.env.VITE_API_URL?.trim();
const productionHosts = new Set([
  'api.lolasrentals.com',
  'lolas-rentals.onrender.com',
]);

let apiHost;
try {
  apiHost = apiUrl ? new URL(apiUrl).hostname : undefined;
} catch {
  // Report the invalid value with the same actionable error below.
}

if (!apiHost || productionHosts.has(apiHost)) {
  console.error(
    'Vercel Preview requires VITE_API_URL to point to the staging API. Refusing to build a preview against production.',
  );
  process.exit(1);
}

console.log(`Vercel Preview API: ${apiHost}`);
