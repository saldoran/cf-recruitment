---
name: write-frontend-tests
description: Conventions and patterns for Vitest + React Testing Library unit tests of the React frontend in frontend/ - components, React Query hooks, fetch helpers, timers. Use before writing or editing any frontend test file.
---

# Frontend unit tests (Vitest + React Testing Library)

## Layout and style

- Tests sit next to the source: `TodoItem.tsx` → `TodoItem.test.tsx`, `useTodosQuery.ts` → `useTodosQuery.test.tsx` when the test needs JSX (a provider wrapper), `.test.ts` otherwise.
- Import helpers explicitly: `import { expect, it, vi } from 'vitest'`, `render`, `renderHook`, `screen`, `waitFor`, `act` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`.
- `src/test/setup.ts` already registers jest-dom matchers and cleanup. `src/test/todoFixture.ts` exports `todoFixture`.
- Prettier style: no semicolons, single quotes, trailing commas, lines up to 80 characters.
- Tests are type-checked (`tsc --noEmit` covers `src`). Type mocks with `vi.mocked(fn)`; cast partial hook results as `as unknown as ReturnType<typeof useHook>`.
- Query like a user: `getByRole` with a name, `getByLabelText`, `getByText`. Interact with `const user = userEvent.setup()`.

## Patterns

**Components.** Replace the design system with its test doubles; the path is relative to the test file:

```tsx
vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
```

The doubles render native elements: inputs inside a `<label>` with the label text, `<select>` with options, buttons, an `Alert` with `data-testid="alert"`, a `Drawer` as `role="dialog"`. Mock child components or hooks the same way existing tests do (see `TodosPage.test.tsx`).

**React Query hooks.** Use a fresh client per test and mock the API module, not `fetch`:

```tsx
vi.mock('../api/todos', () => ({
  todosApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
```

Seed the cache with `client.setQueryData(todoKeys.list, [...])`, run `await act(() => result.current.mutateAsync(input))`, then assert `client.getQueryData(todoKeys.list)`. Wait for queries with `await waitFor(() => expect(result.current.isSuccess).toBe(true))`. A pending mutation can be held open with `new Promise(() => {})`.

**`fetch` helpers (`src/lib/http.ts`).** Stub the global and build real responses:

```ts
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Nope' }), { status: 400 }))
```

Use `new Response(null, { status: 204 })` for empty bodies and `mockRejectedValue(new TypeError('Failed to fetch'))` for network errors. Call `vi.unstubAllGlobals()` in `afterEach`.

**Timers and dates.** `vi.useFakeTimers()`, advance with `act(() => vi.advanceTimersByTime(4000))`, and `vi.useRealTimers()` in `afterEach`. Pin "today" with `vi.setSystemTime(new Date(2026, 9, 15, 10))` (local time). With fake timers, create the user as `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

**Providers.** Render `AppProviders` with a custom `client` and a child that reads it (`useQueryClient()`), and assert the child renders and receives that client.
