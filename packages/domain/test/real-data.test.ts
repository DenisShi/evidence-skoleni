import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDataset } from '../src/import/index.ts';

// The real exports contain personal data and are not in the repository; this suite runs only
// where they are available locally (`data/`). CI relies on the synthetic fixtures.
const dataDir = new URL('../../../data/', import.meta.url);
const available = existsSync(new URL('zamestnanci.csv', dataDir));
const read = (name: string) => readFileSync(new URL(`${name}.csv`, dataDir));

describe.skipIf(!available)('import of the real exports', () => {
  const run = () =>
    importDataset({
      employees: read('zamestnanci'),
      records: read('absolvovana_skoleni'),
      catalog: read('katalog_skoleni'),
      sessions: read('terminy_skoleni'),
      exportDate: '2026-10-01',
    });

  it('matches the record count declared in the export', () => {
    const { report } = run();
    expect(report.issues.find((i) => i.type === 'kontrolni-soucet')?.severity).toBe('info');
    expect(report.files.find((f) => f.file === 'absolvovana_skoleni')).toMatchObject({
      rowsRead: 2865,
    });
  });

  it('produces the counts established during data analysis', () => {
    const { dataset, report } = run();
    const count = (type: string) => report.issues.filter((i) => i.type === type).length;

    expect(dataset.employees).toHaveLength(170);
    expect(count('duplicitni-zamestnanec')).toBe(4);
    expect(count('odvozeny-utvar')).toBe(5);
    expect(count('chybi-utvar')).toBe(0);
    expect(count('neznamy-zamestnanec')).toBe(9);
    expect(count('nesouhlasi-jmeno')).toBe(5);
    expect(count('datum-v-budoucnu')).toBe(5);
    expect(count('duplicitni-zaznam')).toBe(25);
    expect(dataset.sessions).toHaveLength(33);
    expect(new Set(dataset.employees.map((e) => e.unit)).size).toBe(9);
  });

  it('does not leak birth numbers', () => {
    const { dataset, report } = run();
    expect(JSON.stringify({ dataset, report })).not.toMatch(/\d{6}\/\d{4}/);
  });
});
