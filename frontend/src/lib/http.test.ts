import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('prefixes the path with /api and parses a JSON body', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ id: 1 }), { status: 200 }),
  )
  await expect(request<{ id: number }>('/todos/1')).resolves.toEqual({ id: 1 })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos/1', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('merges caller headers with the JSON content type', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
  await request('/todos', { headers: { 'X-Trace': 'abc' } })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
  })
})

it('returns undefined for a 204 response without a body', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(request('/todos/1', { method: 'DELETE' })).resolves.toBe(
    undefined,
  )
})

it('reports a friendly message when the server cannot be reached', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const abortError = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abortError)
  const controller = new AbortController()
  controller.abort()
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('explains the field limits for a 422 response', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: 'ignored' }), { status: 422 }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('uses the server detail message for other error responses', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: 'Nope' }), { status: 400 }),
  )
  await expect(request('/todos')).rejects.toThrow('Nope')
})

it('falls back to a generic message when the error body has no detail', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ error: 'x' }), { status: 500 }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('falls back to a generic message when the error body is not JSON', async () => {
  fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})
