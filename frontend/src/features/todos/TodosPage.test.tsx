import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../test/todoFixture'
import { useNotice } from '../../hooks/useNotice'
import { DeleteTodoDialog } from './components/DeleteTodoDialog'
import { TodoEditor } from './components/TodoEditor'
import { TodoList } from './components/TodoList'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({ onCreate }: { onCreate: () => void }) => (
    <>
      <h1>Tasks</h1>
      <button onClick={onCreate}>New task</button>
    </>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: vi.fn(() => <p>Task list</p>),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: vi.fn(() => <p>Editor</p>),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: vi.fn(() => <p>Delete dialog</p>),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function renderPage({
  busy = false,
  mutateAsync = vi.fn(),
}: { busy?: boolean; mutateAsync?: ReturnType<typeof vi.fn> } = {}) {
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todoFixture],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset: vi.fn(),
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [todoFixture],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return { notify }
}

function latestListProps() {
  const props = vi.mocked(TodoList).mock.lastCall?.[0]
  if (!props) throw new Error('The task list was not rendered.')
  return props
}

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('marks a completed task as active and announces it', async () => {
  const saved = { ...todoFixture, completed: false }
  const mutateAsync = vi.fn().mockResolvedValue(saved)
  const { notify } = renderPage({ mutateAsync })

  await act(async () => {
    latestListProps().onToggle({ ...todoFixture, completed: true })
  })

  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: false },
  })
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Task marked as active.'),
  )
})

it('completes an open task and celebrates it', async () => {
  const saved = { ...todoFixture, completed: true }
  const mutateAsync = vi.fn().mockResolvedValue(saved)
  const { notify } = renderPage({ mutateAsync })

  await act(async () => {
    latestListProps().onToggle(todoFixture)
  })

  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: true },
  })
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Another task complete. Well done!'),
  )
})

it('does not toggle a task while another change is in progress', async () => {
  const mutateAsync = vi.fn()
  renderPage({ busy: true, mutateAsync })

  await act(async () => {
    latestListProps().onToggle(todoFixture)
  })

  expect(mutateAsync).not.toHaveBeenCalled()
})

it('keeps the page quiet when a toggle fails', async () => {
  const mutateAsync = vi.fn().mockRejectedValue(new Error('Save failed.'))
  const { notify } = renderPage({ mutateAsync })

  await act(async () => {
    latestListProps().onToggle(todoFixture)
  })

  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor for a new task and closes it on cancel', async () => {
  const user = userEvent.setup()
  renderPage()

  expect(screen.queryByText('Editor')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New task' }))
  expect(screen.getByText('Editor')).toBeInTheDocument()
  expect(vi.mocked(TodoEditor).mock.lastCall?.[0]).toMatchObject({
    todo: 'new',
  })

  act(() => vi.mocked(TodoEditor).mock.lastCall?.[0].onClose())
  expect(screen.queryByText('Editor')).not.toBeInTheDocument()
})

it('opens the new task editor from the empty task list', () => {
  renderPage()

  act(() => latestListProps().onCreate())

  expect(screen.getByText('Editor')).toBeInTheDocument()
  expect(vi.mocked(TodoEditor).mock.lastCall?.[0]).toMatchObject({
    todo: 'new',
  })
})

it('closes the editor and announces the saved task', async () => {
  const user = userEvent.setup()
  const { notify } = renderPage()
  await user.click(screen.getByRole('button', { name: 'New task' }))

  act(() => vi.mocked(TodoEditor).mock.lastCall?.[0].onSaved('New task added.'))

  expect(screen.queryByText('Editor')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('New task added.')
})

it('opens the delete confirmation and announces a deleted task', async () => {
  const { notify } = renderPage()

  act(() => latestListProps().onDelete(todoFixture))
  expect(screen.getByText('Delete dialog')).toBeInTheDocument()
  expect(vi.mocked(DeleteTodoDialog).mock.lastCall?.[0]).toMatchObject({
    todo: todoFixture,
  })

  act(() => vi.mocked(DeleteTodoDialog).mock.lastCall?.[0].onDeleted())
  expect(screen.queryByText('Delete dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})

it('closes the delete confirmation without announcing anything', async () => {
  const { notify } = renderPage()

  act(() => latestListProps().onDelete(todoFixture))
  act(() => vi.mocked(DeleteTodoDialog).mock.lastCall?.[0].onClose())

  expect(screen.queryByText('Delete dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
