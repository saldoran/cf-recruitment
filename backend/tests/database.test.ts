import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';

afterEach(() => vi.restoreAllMocks());

it('creates the todos table when it does not exist yet', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const executeRaw = vi.spyOn(database, '$executeRaw').mockResolvedValue(0);
  await initialize(database);
  expect(executeRaw).toHaveBeenCalledOnce();
  const sql = (executeRaw.mock.calls[0][0] as TemplateStringsArray).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain('CHECK (priority IN (\'low\', \'medium\', \'high\'))');
});

it('propagates failures while creating the table', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  vi.spyOn(database, '$executeRaw').mockRejectedValue(new Error('permission denied'));
  await expect(initialize(database)).rejects.toThrow('permission denied');
});
