import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = { todo: { findFirst: vi.fn().mockResolvedValue({ id: 1 }) } };
  const app = express();
  app.use('/api', createHealthRouter(database as unknown as Database));
  app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).json({ detail: error.message });
  });
  return { app, database };
}

it('reports ok when the database answers a query', async () => {
  const { app, database } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(database.todo.findFirst).toHaveBeenCalledWith({ select: { id: true } });
});

it('passes a database failure on to the error handler', async () => {
  const { app, database } = setup();
  database.todo.findFirst.mockRejectedValueOnce(new Error('Database unavailable'));
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Database unavailable' });
});
