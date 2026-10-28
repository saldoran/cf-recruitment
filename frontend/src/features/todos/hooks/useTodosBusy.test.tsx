import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todosApi } from '../api/todos'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from './useCreateTodoMutation'
import { useTodosBusy } from './useTodosBusy'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

it('reports busy while a task mutation is pending', async () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  let finishCreate: (value: typeof todoFixture) => void = () => {}
  vi.mocked(todosApi.create).mockReturnValue(
    new Promise((resolve) => {
      finishCreate = resolve
    }),
  )
  const { result } = renderHook(
    () => ({ busy: useTodosBusy(), create: useCreateTodoMutation() }),
    { wrapper },
  )
  expect(result.current.busy).toBe(false)

  act(() => {
    void result.current.create.mutateAsync(todoFixture)
  })
  await waitFor(() => expect(result.current.busy).toBe(true))

  await act(async () => {
    finishCreate(todoFixture)
  })
  await waitFor(() => expect(result.current.busy).toBe(false))
})
