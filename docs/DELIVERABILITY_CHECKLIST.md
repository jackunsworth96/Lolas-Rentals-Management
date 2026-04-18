# Email Deliverability Checklist
**Sender:** bookings@lolasrentals.com (via Resend)

## Hostinger DNS records to add
- SPF: already added via Resend verification
- DKIM: already added via Resend verification
- DMARC: add TXT record `_dmarc.lolasrentals.com` with value:
  `v=DMARC1; p=quarantine; rua=mailto:postmaster@lolasrentals.com; ruf=mailto:postmaster@lolasrentals.com; fo=1;`

## Warm-up plan (run 48 hours before go-live)
1. Day -2 AM: send 5 test bookings to team gmail/outlook/yahoo — reply to each
2. Day -2 PM: send 5 more; mark as Not Spam if they land in junk
3. Day -1 AM: send 10 with varied templates (booking, cancel, driver, waiver)
4. Day -1 PM: send 10 more; confirm every one reaches inbox
5. Day 0 AM: send 20; monitor delivery metrics in Resend dashboard

## Post-launch inbox placement
- Monitor postmaster@lolasrentals.com for DMARC aggregate reports weekly
- In Resend: alert if bounce rate > 2% or complaint rate > 0.1%
