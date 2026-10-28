import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useClearCompletedMutation } from './useClearCompletedMutation'

vi.mock('../api/todos', () => ({
  todosApi: { clearCompleted: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const openTask = { ...todoFixture, id: 1, completed: false }
const doneTask = { ...todoFixture, id: 2, completed: true }

it('removes completed tasks from the cached list after clearing them', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [openTask, doneTask])
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })

  await act(() => result.current.mutateAsync())

  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
  expect(client.getQueryData(todoKeys.list)).toEqual([openTask])
})

it('keeps every task in the cached list when none are completed', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [openTask])
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })

  await act(() => result.current.mutateAsync())

  expect(client.getQueryData(todoKeys.list)).toEqual([openTask])
})
