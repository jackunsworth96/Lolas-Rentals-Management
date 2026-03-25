# Architecture Decision Records

## Hexagonal Architecture (Ports & Adapters)

Four layers with strict dependency boundaries:

1. **Domain** (`packages/domain`) - Pure business logic, zero external deps
2. **Shared** (`packages/shared`) - API contracts (Zod schemas, types)
3. **Application + Infrastructure** (`apps/api`) - Use cases + Supabase adapters
4. **Presentation** (`apps/web`) - React frontend

## Key Decisions

- **Supabase** replaces Google Sheets as sole source of truth
- **Google Sheets** becomes read-only background sync mirror
- **Custom JWT auth** with bcrypt-hashed PINs
- **300-line file limit** enforced throughout
- **TDD** - tests written before implementation
