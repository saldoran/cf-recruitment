import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn(), stats: vi.fn().mockResolvedValue({ total: 2, completed: 1, open: 1 }) };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it('returns stats from the repository instead of parsing "stats" as an ID', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos/stats');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ total: 2, completed: 1, open: 1 });
  expect(repository.stats).toHaveBeenCalledOnce();
  expect(repository.get).not.toHaveBeenCalled();
});
it('returns a task by ID and 404 for a missing task', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValueOnce(todo).mockResolvedValueOnce(null);
  const found = await request(app).get('/api/todos/1');
  expect(found.status).toBe(200);
  expect(found.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
  const missing = await request(app).get('/api/todos/2');
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ detail: 'Task not found.' });
});
it('rejects a task ID that is not a positive integer without calling the repository', async () => {
  const { app, repository } = setup();
  expect((await request(app).get('/api/todos/abc')).status).toBe(422);
  expect((await request(app).patch('/api/todos/0').send({ completed: true })).status).toBe(422);
  expect((await request(app).delete('/api/todos/-1')).status).toBe(422);
  expect(repository.get).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});
it('updates a task and rejects invalid or empty patches', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValueOnce({ ...todo, completed: true }).mockResolvedValueOnce(null);
  const response = await request(app).patch('/api/todos/1').send({ completed: true });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...todo, completed: true });
  expect(repository.update).toHaveBeenCalledWith(1, { completed: true });
  expect((await request(app).patch('/api/todos/2').send({ completed: true })).status).toBe(404);
  expect((await request(app).patch('/api/todos/1').send({})).status).toBe(422);
  expect((await request(app).patch('/api/todos/1').send({ id: 5 })).status).toBe(422);
  expect(repository.update).toHaveBeenCalledTimes(2);
});
it('deletes a task with 204 and returns 404 for a missing task', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const deleted = await request(app).delete('/api/todos/1');
  expect(deleted.status).toBe(204);
  expect(repository.delete).toHaveBeenCalledWith(1);
  const missing = await request(app).delete('/api/todos/2');
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ detail: 'Task not found.' });
});
