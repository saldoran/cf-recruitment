import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const open: Todo = { ...todoFixture, id: 1, title: 'Write report' }
const done: Todo = {
  ...todoFixture,
  id: 2,
  title: 'Book room',
  completed: true,
}

it('starts with all tasks, no search and newest first', () => {
  const { result } = renderHook(() => useTodoFilters([open, done]))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toHaveLength(2)
})

it('updates the visible tasks when the filter, search or sort changes', () => {
  const { result } = renderHook(() => useTodoFilters([open, done]))

  act(() => result.current.setFilter('completed'))
  expect(result.current.visible).toEqual([done])

  act(() => {
    result.current.setFilter('all')
    result.current.setSearch('report')
  })
  expect(result.current.search).toBe('report')
  expect(result.current.visible).toEqual([open])

  act(() => {
    result.current.setSearch('')
    result.current.setSort('priority')
  })
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toHaveLength(2)
})
