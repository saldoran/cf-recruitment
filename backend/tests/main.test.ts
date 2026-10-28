import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/lifespan.ts', () => ({ start: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.mocked(start).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

it('starts the API without changing the exit code', async () => {
  vi.mocked(start).mockResolvedValue({} as never);
  await import('../src/main.ts');
  await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  expect(process.exitCode).toBeUndefined();
});

it('logs the startup failure and sets a failing exit code', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new Error('Missing environment variable: DB_PORT');
  vi.mocked(start).mockRejectedValue(failure);
  await import('../src/main.ts');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(consoleError).toHaveBeenCalledWith('Cannot start Taskly App Node API:', failure);
});
