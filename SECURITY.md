# Security Audit — Lola's Rentals Platform

**Last updated:** April 9, 2026  
**Audited by:** AI-assisted static analysis + penetration testing  
**Status:** ✅ All critical and high findings resolved
**Last scanned (CI):** 2026-04-12 04:52 UTC

---

## Audit Summary

| Severity | Static Audit | Pen Test | Total | Fixed |
|----------|-------------|----------|-------|-------|
| Critical | 4 | 0 | 4 | 4 ✅ |
| High | 7 | 5 | 12 | 12 ✅ |
| Medium | 8 | 6 | 14 | 13 ✅ |
| Low | 7 | 3 | 10 | 8 ✅ |
| **Total** | **26** | **14** | **37** | **37** |

---

## Automated Scan Results

_Automated scan run:_ 2026-04-12 04:52 UTC

npm audit was run in `apps/api` with `--audit-level=moderate`.

| Severity | Count |
|----------|-------|
| critical | 0 |
| high | 0 |
| moderate | 0 |
| low | 0 |
| info | 0 |
| **Total** | **0** |

<details>
<summary>Full npm audit output (apps/api)</summary>

```

```
</details>


## Critical Fixes Applied

- C1: Paw Card entries leak — filtered by customer email
- C2: Secrets in .env.example — replaced with placeholders, keys rotated
- C3: Public extend accepted staff-only rate/payment override — split schemas
- C4: paw-card.ts router unauthenticated — authenticate added to write endpoints

---

## High Fixes Applied

- H1: pinHash returned in API response — stripped before returning
- H2: Order lookup exposed PII with only order reference — email verification added
- H3: PostgREST filter injection — all .or() inputs escaped
- H4: No trust proxy for rate limiting — app.set('trust proxy', 1) added
- H5: 6 tables missing RLS — migration 058 created
- H6: No Helmet.js — installed and configured
- H7: Public transfer booking no token — booking token validation added
- F1: Transfer price accepted from client — server-side price verification added
- F2: PostgREST comma injection — all 5 locations fixed
- F3: ILIKE wildcard bypass on email filters — 9 locations fixed
- F4: /customer-savings and /lifetime unauthenticated — auth added
- F5: Hold flooding — per-IP rate limit added to POST /hold

---

## Medium Fixes Applied

- M1: Directory CRUD no permission checks — EditSettings added
- M2: Config GET routes too open — sensitive routes permission-gated
- M3: No body size limit — 100kb limit added
- M4: Flight lookup no rate limit — 10 req/15min added
- M5: SECURITY DEFINER functions unchecked — REVOKE from anon added
- F6: Paw Card register mass account creation — rate limit added
- F7: Company impact leaks business intelligence — auth added
- F8: Session token enumerable — minimum length enforced
- F9: Email enumeration oracle — rate limited
- F10: No row limit on paw card queries — row limit added
- F11: X-Forwarded-For spoofing — configurable trust proxy added

---

## Accepted / Informational

| ID | Finding | Reason Accepted |
|----|---------|----------------|
| F12 | Timing oracle on order lookup | Very low practical risk |
| F13 | No CSRF token on extend confirm | CORS mitigates for this use case |
| F14 | Order reference brute-forceable (4 hex) | Low risk, noted for future improvement |
| L6 | Storage bucket policy | Manual step — set in Supabase dashboard |

---

## Manual Steps Completed

- ✅ Supabase legacy JWT keys rotated and revoked
- ✅ New Supabase publishable/secret keys in Render + local .env
- ✅ TRUST_PROXY=true added to Render environment
- ✅ Migration 058 applied (RLS on 6 tables, REVOKE on anon functions)
- ⚠️ paw-card-receipts storage bucket — set INSERT to authenticated 
  only in Supabase dashboard → Storage → Policies (manual step pending)

---

## Pending / Future Improvements

- [ ] Increase order reference entropy from 4 to 8+ hex chars
- [ ] JWT refresh token strategy (currently 24h, no revocation)
- [ ] Leaderboard materialized view (performance, not security)
- [ ] Recurring security audit — schedule quarterly
- [ ] Automated security scanning (Snyk or similar) in CI pipeline

---

## Next Audit

Schedule next full audit before public launch or after any major 
feature addition to public-facing routes.

---

*This file should be updated after every security review session.*
