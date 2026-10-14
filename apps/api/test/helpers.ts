import { fileURLToPath } from 'node:url';
import { buildApp, type AppOptions } from '../src/app.ts';
import { loadData } from '../src/load-data.ts';

// Synthetic fixtures shared with the domain package – safe to use in CI.
const FIXTURES = fileURLToPath(new URL('../../../packages/domain/test/fixtures', import.meta.url));

export const TODAY = '2026-10-14';
export const data = loadData(FIXTURES, '2026-10-01');

export function testApp(options: Partial<AppOptions> = {}) {
  return buildApp({ data, today: () => TODAY, ...options });
}
