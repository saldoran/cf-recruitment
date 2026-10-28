import { afterEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const postgresVariables = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];

function clearDatabaseEnvironment() {
  vi.stubEnv('DATABASE_URL', '');
  for (const name of postgresVariables) vi.stubEnv(name, '');
}

afterEach(() => vi.unstubAllEnvs());

it('prefers an explicit connection string over the environment', () => {
  clearDatabaseEnvironment();
  vi.stubEnv('DATABASE_URL', 'postgresql://env:env@envhost:5432/env');
  expect(resolveDatabaseUrl('postgresql://arg:arg@arghost:5432/arg')).toBe('postgresql://arg:arg@arghost:5432/arg');
});

it('uses DATABASE_URL when no override is given', () => {
  clearDatabaseEnvironment();
  vi.stubEnv('DATABASE_URL', 'postgresql://env:env@envhost:5432/env');
  expect(resolveDatabaseUrl()).toBe('postgresql://env:env@envhost:5432/env');
});

it('rewrites the SQLAlchemy driver prefix to a plain PostgreSQL URL', () => {
  clearDatabaseEnvironment();
  expect(resolveDatabaseUrl('postgresql+psycopg://user:pass@db:5432/taskly')).toBe('postgresql://user:pass@db:5432/taskly');
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://user:pass@db:5432/taskly');
  expect(resolveDatabaseUrl()).toBe('postgresql://user:pass@db:5432/taskly');
});

it('builds the URL from the POSTGRES_* variables when no URL is set', () => {
  clearDatabaseEnvironment();
  vi.stubEnv('POSTGRES_USER', 'taskly');
  vi.stubEnv('POSTGRES_PASSWORD', 'secret');
  vi.stubEnv('POSTGRES_HOST', 'db');
  vi.stubEnv('DB_PORT', '5432');
  vi.stubEnv('POSTGRES_DB', 'my db');
  expect(resolveDatabaseUrl()).toBe('postgresql://taskly:secret@db:5432/my%20db');
});

it.each(postgresVariables)('reports a missing %s when no URL is available', (name) => {
  clearDatabaseEnvironment();
  for (const other of postgresVariables) vi.stubEnv(other, 'value');
  vi.stubEnv(name, '');
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
