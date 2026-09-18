# Staging deployment

Staging uses three matched services:

- the `staging` Supabase branch;
- the `lolas-rentals-staging` Render API;
- the Vercel Preview deployment for the `staging` Git branch.

Do not point a Vercel Preview deployment at the production API. The Vercel build now fails when `VITE_API_URL` is missing or names a production API host.

## 1. Create the staging API on Render

Create a new Render Blueprint from this repository and select `render.staging.yaml` as its Blueprint path. Enter these prompted values:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL for the Supabase `staging` branch |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for the Supabase `staging` branch |
| `CORS_ORIGIN` | Stable Vercel URL for the `staging` branch |
| `ALLOWED_ORIGIN` | Any additional Vercel Preview origins, comma-separated |
| `WEB_URL` | Stable Vercel URL for the `staging` branch |

Render generates separate `JWT_SECRET` and `UNSUBSCRIBE_SECRET` values. Scheduled jobs and Respond.io chat are disabled in the Blueprint so staging cannot send automated production reminders.

After deployment, verify:

```text
https://lolas-rentals-staging.onrender.com/health
```

The expected response is `{"status":"ok"}`. If Render assigns a suffixed hostname, use the hostname shown in its dashboard.

## 2. Point Vercel Preview at staging

In Vercel, add these variables to the Preview environment, or to the custom `staging` environment if the project uses one:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://<staging-api-host>.onrender.com/api` |
| `VITE_SUPABASE_URL` | Project URL for the Supabase `staging` branch |
| `VITE_SUPABASE_ANON_KEY` | Anon key for the Supabase `staging` branch |

Keep the production values scoped to Vercel Production. Redeploy the `staging` branch after changing environment variables because Vite embeds them during the build.

## 3. Verify the full path

Open the staging web deployment, sign in, and inspect the browser Network tab. `GET /api/fleet?storeId=lolas-rentals` must go to the staging Render hostname and include the staging-only vehicle ID.

If the browser reports a CORS error, add the exact browser origin to `ALLOWED_ORIGIN` on the staging Render service and redeploy it.
