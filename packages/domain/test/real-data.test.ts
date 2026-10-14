import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateCompliance } from '../src/compliance.ts';
import { importDataset } from '../src/import/index.ts';
import { buildOverview } from '../src/overview.ts';
import { planEnrollments } from '../src/scheduler.ts';

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

  it('evaluates compliance as of 14. 10. 2026 (regression snapshot of the totals)', () => {
    const { dataset } = run();
    const overview = buildOverview(
      evaluateCompliance(dataset, { referenceDate: '2026-10-14', warningDays: 90 })
    );
    expect(overview.employeesByState).toEqual({
      active: 145,
      starting: 3,
      leaving: 4,
      parental_leave: 6,
      terminated: 12,
    });
    expect(overview.totals).toEqual({
      total: 751,
      ok: 542,
      expiring: 120,
      expired: 25,
      missing: 64,
      needsAction: 209,
    });
  });

  it('plans every schedulable need as of 14. 10. 2026 (regression snapshot)', () => {
    const { dataset } = run();
    const evaluations = evaluateCompliance(dataset, {
      referenceDate: '2026-10-14',
      warningDays: 90,
    });
    const plan = planEnrollments(dataset, evaluations, '2026-10-14');
    // 209 needs of people at work (see overview) + 7 of people on parental leave
    expect(plan.assignments).toHaveLength(209);
    expect(plan.unassigned.every((u) => u.reason === 'parental-leave')).toBe(true);
    expect(plan.unassigned).toHaveLength(7);
    expect(plan.totalCostCzk).toBe(160900);
    expect(plan.shortages.find((s) => s.code === 'KYBER')).toMatchObject({
      withoutSeat: 0,
      late: 32,
    });
  });
});
