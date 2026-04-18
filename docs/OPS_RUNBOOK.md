# Ops Runbook

## Keeping Render warm (free tier)
Render free dynos sleep after 15 min of inactivity and take ~40s to cold-start.

1. Sign in to https://uptimerobot.com (free tier: 50 monitors, 5-min interval)
2. Add HTTP(s) monitor:
   - Name: Lola's Rentals API — health
   - URL: https://api.lolasrentals.com/api/health
   - Interval: 5 minutes
   - Alert: email jack@lolasrentals.com on DOWN for 10+ minutes
3. Verify first check returns 200 OK within 60s

If upgrading to Render Standard ($7/mo), delete the UptimeRobot monitor — dynos stay warm natively.

## Maya sandbox → production switch
Only after V10-01 + V10-02 + V10-08 confirmed fixed (all done as of Audit V10).
1. Rotate MAYA_SECRET_KEY and MAYA_WEBHOOK_SECRET in Render dashboard
2. Push a ₱1 real transaction end-to-end
3. Verify journal entry + payments row + balance update in Supabase

## Environment variables required on Render (API)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- JWT_SECRET
- RESEND_API_KEY
- CORS_ORIGIN
- MAYA_SECRET_KEY
- MAYA_WEBHOOK_SECRET
- DRIVER_EMAIL
- SENTRY_DSN
- LOG_LEVEL

## Environment variables required on Vercel (Web)
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_API_URL
- VITE_SENTRY_DSN
