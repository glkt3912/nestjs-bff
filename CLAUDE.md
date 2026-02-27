# CLAUDE.md

NestJS BFF template. Auto-generates TypeScript clients from an external backend's Swagger spec.
Follows the Thin BFF pattern: Controllers and Services are one-line delegations with no business logic.

## Communication Language

Always respond in Japanese unless the user explicitly writes in another language.

## Keeping This File Up to Date

Update CLAUDE.md whenever a significant change is made to the project:

- New npm scripts or changes to existing commands
- Architectural changes (new layers, middleware, interceptors, guards)
- Changes to the testing policy or mock patterns
- New conventions or breaking changes to existing ones
- New or removed `docs/` reference documents

## Common Commands

| Command | Purpose |
| ------- | ------- |
| `npm run start:dev` | Start development server |
| `npm test` | Run unit tests |
| `npm run test:cov` | Coverage report (70% threshold) |
| `npm run test:e2e` | E2E tests |
| `npm run lint` | ESLint |
| `npm run gen:all` | Generate client code (requires backend running + Java) |

To run a single test file:

```bash
npx jest src/shared/filters/axios-exception.filter.spec.ts
npx jest --testPathPattern=correlation-id  # partial match also works
```

## Dangerous Commands

> **`npm run gen:all` overwrites all files under `src/generated/`.** Always confirm with the user before running. Requires the backend server running at `BACKEND_SWAGGER_URL` and Java installed.

## Environment Variables

Copy `.env` and adjust as needed. Key variables:

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `BACKEND_API_BASE_URL` | `http://localhost:8080` | Backend base URL |
| `BACKEND_SWAGGER_URL` | `http://localhost:8080/swagger.json` | Used by `gen:all` |
| `MOCK_MODE` | `false` | Set `true` to run without a backend (returns fixtures) |
| `PORT` | `3000` | BFF server port |
| `LOG_LEVEL` | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `HTTP_TIMEOUT` | `5000` | Axios timeout (ms) |
| `THROTTLE_TTL` | `60000` | Rate limit window (ms) |
| `THROTTLE_LIMIT` | `100` | Max requests per window |
| `AUTH_TYPE` | `none` | `api-key` / `bearer` / `none` |
| `BACKEND_API_KEY` | `` | `AUTH_TYPE=api-key` のとき `X-API-Key` ヘッダに設定 |
| `BACKEND_BEARER_TOKEN` | `` | `AUTH_TYPE=bearer` のとき `Authorization: Bearer` ヘッダに設定 |
| `JWT_AUTH_ENABLED` | `false` | `true` でクライアント→BFF 間の JWT 検証を有効化 |
| `JWT_SECRET` | `` | JWT 署名検証用の秘密鍵（`JWT_AUTH_ENABLED=true` のとき必須） |

**Tip:** Set `MOCK_MODE=true` to develop and test without a running backend.

## Architecture

Request processing order:

1. **Express middleware**: `correlationIdMiddleware`, `pino-http`
2. **NestJS globals**: `ThrottlerGuard`, `JwtAuthGuard`, `ValidationPipe`, `AxiosExceptionFilter`
3. **Axios interceptors**: `LoggingInterceptor`, `AuthHeaderInterceptor`, `MockInterceptor`
4. **Routes**: `/api/health` (HealthModule), `/api/*` (API modules)
5. **Swagger UI**: `/api-docs` (JWT Bearer 認証スキーマ付き)

Key directories:

- `src/shared/` — Shared infrastructure layer (reusable across projects)
- `src/generated/` — Auto-generated code (**do not read or edit manually**)
- `src/users/` — Reference implementation for new modules (Thin BFF pattern example)
- `docs/` — Design documents (15 files, searchable via MCP docs server)

**When adding a new module, refer to `src/users/` as the template.**

## Coding Conventions

- Single quotes, trailing commas (Prettier `.prettierrc`)
- `noImplicitAny: false` (type inference allowed)
- Conventional Commits: `feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`
- Branch naming: `feat/feature-name`
- **Commit messages: English**
- **PR title and body: Japanese**

## Testing Policy

**What to test:**

- Infrastructure layer under `src/shared/` (Filters, Interceptors, Middleware)

**What NOT to test:**

- Controllers and Services (one-line delegations with no logic)
- `*.module.ts`, `main.ts`, `src/users/`, `src/generated/`

Coverage is enforced at 70% statements globally. `src/generated/`, `src/users/`, `*.module.ts`, `src/main.ts`, and `src/shared/config/` are excluded from coverage collection.

**Key mock patterns (see `docs/testing-strategy.md` for details):**

| Target | Pattern |
| ------ | ------- |
| PinoLogger | Inject via `getLoggerToken(ClassName.name)` |
| Axios interceptors | Capture `use` callback and invoke directly |
| ArgumentsHost | Build mock object with `as unknown as ArgumentsHost` |
| Plain function Middleware | Call directly without `Test.createTestingModule` |

## Adding a New API Module

1. Update backend Swagger → run `npm run gen:all` to regenerate (confirm before running)
2. Use `src/users/` as the reference implementation
3. Handwrite Controller, Service, and DTOs in `src/<module>/`
4. Controller and Service must only delegate — no logic
5. Add `@Expose()` to handwritten response DTOs for filtering (see `docs/response-filtering.md`)
6. Add `@ApiBearerAuth()` to Controllers that require JWT auth (i.e. no `@Public()` decorator)
7. No tests needed unless you extend the infrastructure layer

## MCP Docs Server

The `docs` MCP server is enabled for this project. Use it to search design documents without reading raw files:

- Search by keyword across all 15 docs
- Retrieve specific document content by path
- Prefer MCP over reading `docs/*.md` files directly to save context

## Files to Avoid Reading

Skip these unless explicitly needed — they are large and auto-generated or trivial:

- `src/generated/**` — auto-generated TypeScript client (thousands of lines)
- `node_modules/**` — dependencies
- `coverage/**` — test output

## Reference Documents

Key files under `docs/`:

| File | Content |
| ---- | ------- |
| `architecture.md` | Layer structure, Axios integration, exception design |
| `testing-strategy.md` | Test policy and mock pattern reference |
| `development.md` | Step-by-step endpoint addition guide |
| `setup.md` | Initial setup and environment variables |
| `bff-design-philosophy.md` | Thin BFF design rationale |
| `response-filtering.md` | Response DTOs and `@Expose()` usage |
| `axios-interceptors.md` | Axios interceptor implementation details |
| `express-middleware.md` | Middleware implementation details |
| `arguments-host.md` | ArgumentsHost mock patterns |
| `jwt-authentication.md` | JWT auth guard, `@Public()` decorator, configuration |
