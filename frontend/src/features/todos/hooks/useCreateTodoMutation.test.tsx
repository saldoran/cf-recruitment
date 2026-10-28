import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
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

const other: Todo = { ...todoFixture, id: 3, title: 'Other task' }

it('puts the saved task first in the cached list', async () => {
  const { client, wrapper } = setup()
  client.setQueryData<Todo[]>(todoKeys.list, [other])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(todoFixture))

  expect(todosApi.create).toHaveBeenCalledWith(todoFixture)
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})

it('replaces a cached task that has the same id instead of duplicating it', async () => {
  const { client, wrapper } = setup()
  const stale = { ...todoFixture, title: 'Old title' }
  client.setQueryData<Todo[]>(todoKeys.list, [other, stale])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(todoFixture))

  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})

it('starts the cached list from the saved task when nothing is cached', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(todoFixture))

  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
