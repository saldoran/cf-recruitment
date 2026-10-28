import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

const input: TodoInput = {
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('shows only completed tasks for the completed filter', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('sorts by due date with undated tasks last and ties by newest id', () => {
    const early = { ...base, id: 2, due_date: '2026-10-01' }
    const late = { ...base, id: 3, due_date: '2026-10-20' }
    const tieA = { ...base, id: 4, due_date: '2026-10-01' }
    expect(
      selectTodos([base, late, early, tieA], 'all', '', 'due').map((t) => t.id),
    ).toEqual([4, 2, 3, 1])
  })

  it('sorts by creation date, newest first, and breaks ties by id', () => {
    const older = { ...base, id: 2, created_at: '2026-09-01T00:00:00Z' }
    const newer = { ...base, id: 3, created_at: '2026-10-05T00:00:00Z' }
    const sameTime = { ...base, id: 4, created_at: '2026-10-05T00:00:00Z' }
    expect(
      selectTodos([older, base, newer, sameTime], 'all', '', 'newest').map(
        (t) => t.id,
      ),
    ).toEqual([4, 3, 1, 2])
  })
})

describe('validateTodo', () => {
  it('accepts a valid task with a valid due date', () => {
    expect(validateTodo({ ...input, due_date: '2026-10-15' })).toEqual({})
  })

  it('requires a non-blank title', () => {
    expect(validateTodo({ ...input, title: '   ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('rejects a title longer than 120 characters', () => {
    expect(validateTodo({ ...input, title: 'a'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
  })

  it('rejects a description longer than 2000 characters', () => {
    expect(validateTodo({ ...input, description: 'a'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each(['2026-13-01', '15/10/2026', '2026-02-30'])(
    'rejects the malformed or impossible due date %s',
    (due_date) => {
      expect(validateTodo({ ...input, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 10))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is true for an open task due before today', () => {
    expect(isOverdue({ ...base, due_date: '2026-10-14' })).toBe(true)
  })

  it('is false for a task due today or later', () => {
    expect(isOverdue({ ...base, due_date: '2026-10-15' })).toBe(false)
    expect(isOverdue({ ...base, due_date: '2026-10-16' })).toBe(false)
  })

  it('is false for a completed or undated task', () => {
    expect(
      isOverdue({ ...base, due_date: '2026-10-01', completed: true }),
    ).toBe(false)
    expect(isOverdue(base)).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats an ISO date as a short English date', () => {
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026')
  })
})
