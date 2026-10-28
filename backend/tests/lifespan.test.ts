import express from 'express';
import { afterEach, expect, it, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';
import { createDatabase, initialize } from '../src/core/database.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn(() => 'postgresql://test:test@localhost:5432/test') }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn(() => express()) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function setup() {
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(initialize).mockResolvedValue(undefined);
  return database;
}

it('connects, initializes the schema and listens on the configured port', async () => {
  vi.stubEnv('API_PORT', '0');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const database = setup();
  const { server, database: returned } = await start();
  try {
    expect(database.$connect).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledWith(database);
    expect(returned).toBe(database);
    expect(server.listening).toBe(true);
    expect((server.address() as { port: number }).port).toBeGreaterThan(0);
  } finally {
    server.close();
  }
});

it('disconnects and rethrows when the database cannot be reached', async () => {
  const database = setup();
  const failure = new Error('connection refused');
  database.$connect.mockRejectedValueOnce(failure);
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
});

it('closes the server and disconnects the database on shutdown', async () => {
  vi.stubEnv('API_PORT', '0');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const handlers = new Map<string, () => void>();
  vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
    handlers.set(event, handler);
    return process;
  }) as typeof process.once);
  const database = setup();
  const { server } = await start();
  expect([...handlers.keys()].sort()).toEqual(['SIGINT', 'SIGTERM']);
  handlers.get('SIGTERM')!();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());
  expect(server.listening).toBe(false);
  expect(process.exitCode).toBeUndefined();
});
