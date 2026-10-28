import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';

afterEach(() => vi.restoreAllMocks());

function setup(findMany = vi.fn().mockResolvedValue([])) {
  const database = { todo: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), findMany } };
  return { app: createApp(database as unknown as Database), database };
}

it('serves the health check and the OpenAPI document', async () => {
  const { app } = setup();
  expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  const spec = await request(app).get('/openapi.json');
  expect(spec.status).toBe(200);
  expect(spec.body).toHaveProperty('openapi');
});

it('mounts the task routes on the database', async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const { app } = setup(findMany);
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
  expect(findMany).toHaveBeenCalledWith({ orderBy: [{ created_at: 'desc' }, { id: 'desc' }] });
});

it('returns 404 JSON for unknown routes', async () => {
  const { app } = setup();
  const response = await request(app).get('/no/such/route');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('does not advertise the Express framework', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('returns 422 for malformed JSON bodies', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});

it('returns 413 for bodies over the size limit', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').send({ title: 'x'.repeat(200 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});

it('returns a generic 500 and logs when a route throws', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { app } = setup(vi.fn().mockRejectedValue(new Error('Database unavailable')));
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Database unavailable' }));
});
