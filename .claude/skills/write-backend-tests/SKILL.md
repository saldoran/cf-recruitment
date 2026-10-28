---
name: write-backend-tests
description: Conventions and patterns for Vitest unit tests of the Express 5 + Prisma 7 backend in backend/ - routers with Supertest, Prisma without a database, environment variables, entry points. Use before writing or editing any file in backend/tests.
---

# Backend unit tests (Vitest + Supertest)

## Layout and style

- Tests live in `backend/tests/<module>.test.ts`, one flat folder: `src/api/health.ts` → `tests/health.test.ts`. Add cases to an existing file for the module before creating a new one.
- Import sources with the `.ts` extension: `import { createApp } from '../src/factory.ts'`. Import test helpers from `vitest` explicitly: `import { afterEach, expect, it, vi } from 'vitest'`.
- Reuse `tests/fixture.ts`: `record` is a database row (`TodoRecord`), `todo` is the same task as the API returns it.
- Match the existing style: top-level `it` blocks, `it.each` for input tables, a small `setup()` function that returns what the test needs, names that state behaviour ("returns 404 for a missing task").
- Assert observable results: status codes, JSON bodies, return values, the exact arguments passed to Prisma. Avoid asserting private details.

## Patterns

**Routers.** Mount the router on a fresh app and call it with Supertest. Stub the store with `vi.fn()`:

```ts
function setup() {
  const repository = { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
const response = await request(app).patch('/api/todos/1').send({ completed: true });
```

**The whole app.** `createApp(database)` from `src/factory.ts` adds the health route, OpenAPI routes, the 404 handler and the JSON error handler. Pass a stub database, for example `{ todo: { findFirst: vi.fn() } } as unknown as Database`. Malformed JSON gets 422, a body over 100 kB gets 413, a thrown error gets 500. Silence the expected log: `vi.spyOn(console, 'error').mockImplementation(() => {})`.

**Prisma without PostgreSQL.** `createDatabase('postgresql://test:test@localhost:5432/test')` builds a client without connecting. Mock its IO with spies: `vi.spyOn(database.todo, 'findMany').mockResolvedValue([record])`, `vi.spyOn(database, '$executeRaw').mockResolvedValue(0)`. A tagged-template call receives the template strings as its first argument: `expect(executeRaw.mock.calls[0][0].join('')).toContain('CREATE TABLE IF NOT EXISTS todos')`. Call `vi.restoreAllMocks()` in `afterEach`.

**Environment variables.** Set every variable the code reads with `vi.stubEnv`, including `vi.stubEnv('DATABASE_URL', '')` to clear a value from the machine, and call `vi.unstubAllEnvs()` in `afterEach`.

**Module mocks and entry points.** `vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }))` also replaces imports written as `./database.js` inside `src`. For a module that runs code on import (`src/main.ts`), mock its dependencies, then `await import('../src/main.ts')` inside the test, and reset `process.exitCode` in `afterEach`.

**Process lifecycle.** Do not register real signal handlers or exit the process: capture handlers with `vi.spyOn(process, 'once')`, and stub `process.exit` when the code may call it. Listen on port 0 (`vi.stubEnv('API_PORT', '0')`) and close every server a test starts.

**Time.** Use `expect.any(Date)`, or `vi.useFakeTimers()` with `vi.setSystemTime()` and `vi.useRealTimers()` in `afterEach`.
