**Overview**

This document describes the overall backend architecture for the Spicebound server (monorepo root). It covers major components, the request lifecycle, data flow, integrations, deployment, and where key code lives in the repository.

**System Summary**

- **Type:** NestJS HTTP/API server
- **Language:** TypeScript
- **ORM/DB:** Prisma + PostgreSQL
- **Auth:** JWT access tokens (short-lived) + refresh tokens
- **External services:** OpenAI, Stripe, Google Books, Open Library, email provider
- **Deployment:** Docker + compose, Caddy as reverse proxy

**Repository map (key files)**

- `src/main.ts` — server bootstrap and global middleware ([src/main.ts](src/main.ts))
- `src/app.module.ts` — root module wiring providers and modules ([src/app.module.ts](src/app.module.ts))
- `src/config/index.ts` — configuration loader ([src/config/index.ts](src/config/index.ts))
- `src/main/auth` — authentication module (controllers, guards, services) ([src/main/auth](src/main/auth))
- `prisma/schema.prisma` — data model and migrations ([prisma/schema.prisma](prisma/schema.prisma))
- `package.json` — scripts and dependencies ([package.json](package.json))

**High-level Components**

- **API Layer (Controllers):** HTTP endpoints that validate input, authorize requests and forward to services.
- **Service Layer:** Business logic, orchestration of repositories, third-party APIs, and background jobs.
- **Repository/ORM (Prisma):** Database access and transactions. Generated client under `prisma/generated/prisma-client`.
- **Background Workers / Cron Jobs:** Periodic tasks (email reminders, enrichment jobs, long-running OpenAI tasks) — launched via scripts or separate processes in production.
- **Config & Secrets:** Environment-driven config (see `.env` / `src/config`), with provider-specific keys (OPENAI_KEY, STRIPE_SECRET_KEY, etc.).

**Request lifecycle (typical API call)**

1. Client sends HTTP request to the server (Caddy -> Docker -> app).
2. `src/main.ts` starts Nest app and applies global pipes, guards, interceptors.
3. Request reaches a Controller. Controller handles input validation (DTOs) and auth guards.
4. Controller calls injected Service method.
5. Service coordinates: reads/writes via Prisma client, calls external services (OpenAI, Stripe, Google Books), and emits events or enqueues background jobs if needed.
6. Prisma performs SQL operations on PostgreSQL. Transactions used where multiple writes must be atomic.
7. Service returns result to Controller; Controller returns HTTP response.

**Authentication & Authorization**

- **JWT Access tokens:** short-lived, used for API authorization via auth guard.
- **Refresh tokens:** stored hashed in DB (or persistent store) for renewing access tokens.
- **Common files:** check `src/main/auth` for guard, strategy, and token service implementations.

**External Integrations**

- **OpenAI:** used for enrichment and content generation. Config in `src/config/openai.config.ts` reads model key and model name from environment.
- **Stripe:** billing and webhooks; secret and webhook secret in env. Payment events handled in subscription module.
- **Google Books / Open Library:** book metadata lookups via search endpoints. Used during book enrichment flows.
- **Email provider:** SMTP creds used for transactional mails (password resets, notifications).

**Background jobs & long-running flows**

- Enrichment (calls to OpenAI or remote book sources) is done asynchronously to avoid blocking HTTP requests. The pattern is: accept request -> enqueue job -> return 202 -> process job -> persist results and notify user via webhook/email or websockets.

**Observability & Logging**

- Log using Nest logger or a structured logger. Capture request id, user id, and correlation ids for tracing.
- Expose health checks and metrics endpoints for monitoring.

**Deployment & Local dev**

- Dockerfile and compose.yaml are provided for containerized deployment. Caddy is used as a reverse proxy in front of the app.
- Local dev: run `pnpm install` then `pnpm start:dev` (or `node` script defined in `package.json`). Ensure `.env` contains database and API keys.

**Security considerations**

- Keep secrets out of source control — use environment variables or a secrets manager.
- Hash refresh tokens and sensitive data at rest.
- Validate and sanitize any user content forwarded to external APIs (rate-limit, content policy checks).

**Typical sequence diagrams (textual)**

- API request -> Controller -> Service -> (Prisma -> DB) -> Service -> Controller -> Response
- Book enrichment flow: API -> Service -> Enqueue job -> Worker -> OpenAI/API -> Persist -> Notify

**Next steps / Where to expand**

- Add architecture diagrams (sequence and component diagrams).
- Document background job queue implementation details (Redis/Bull, or native scheduler).
- Add a section on scaling (DB pooling, horizontal app scaling, caching strategy).

If you want, I can add diagrams (Mermaid) or expand any section into a deeper design doc.
