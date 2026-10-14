import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDataset } from '../src/import/index.ts';
import type { DataIssue } from '../src/types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.csv`, import.meta.url));

const { dataset, report } = importDataset({
  employees: fixture('zamestnanci'),
  records: fixture('absolvovana_skoleni'),
  catalog: fixture('katalog_skoleni'),
  sessions: fixture('terminy_skoleni'),
  exportDate: '2026-10-01',
});

const issuesFor = (ref: string) => report.issues.filter((i) => i.ref === ref).map((i) => i.type);
const employee = (id: string) => dataset.employees.find((e) => e.id === id);
const record = (id: string) => dataset.records.find((r) => r.id === id);
const session = (id: string) => dataset.sessions.find((s) => s.id === id);

describe('import summary', () => {
  it('reports rows read and imported per file, including detected encodings', () => {
    expect(report.files).toEqual([
      { file: 'zamestnanci', encoding: 'utf-8', rowsRead: 7, imported: 6, excluded: 1 },
      {
        file: 'absolvovana_skoleni',
        encoding: 'windows-1250',
        rowsRead: 13,
        imported: 7,
        excluded: 6,
      },
      { file: 'katalog_skoleni', encoding: 'utf-8', rowsRead: 4, imported: 4, excluded: 0 },
      { file: 'terminy_skoleni', encoding: 'utf-8', rowsRead: 7, imported: 6, excluded: 1 },
    ]);
  });

  it('never carries birth numbers into the result', () => {
    expect(JSON.stringify({ dataset, report })).not.toMatch(/000101\/000\d/);
  });

  it('describes every issue in Czech with a severity', () => {
    const severities = new Set(report.issues.map((i: DataIssue) => i.severity));
    expect([...severities].every((s) => ['error', 'warning', 'info'].includes(s))).toBe(true);
    expect(report.issues.every((i) => i.message.length > 10)).toBe(true);
  });
});

describe('catalog', () => {
  it('parses validity written in years and one-off trainings', () => {
    const byCode = Object.fromEntries(dataset.trainingTypes.map((t) => [t.code, t]));
    expect(byCode['LAB-BEZ']?.validityMonths).toBe(24);
    expect(byCode['LEAD']?.validityMonths).toBeNull();
    expect(byCode['LAB-BEZ']?.requirement).toEqual({ kind: 'units', units: ['Laboratoře'] });
    expect(byCode['LEAD']?.requirement).toEqual({ kind: 'positions', positions: ['Vedoucí'] });
  });
});

describe('employees', () => {
  it('merges the same person exported twice (same birth number)', () => {
    expect(employee('E1000')).toBeUndefined();
    expect(employee('E0003')).toMatchObject({
      firstName: 'Karel',
      lastName: 'Novák',
      email: 'karel.novak@test.example',
      unit: 'Laboratoře',
      startDate: '2019-08-03',
      mergedIds: ['E1000'],
    });
    expect(issuesFor('E1000')).toContain('duplicitni-zamestnanec');
  });

  it('infers a missing unit of a manager from their reports', () => {
    expect(employee('E0002')).toMatchObject({ unit: 'Laboratoře', unitInferred: true });
  });

  it('infers a missing unit of an employee from their manager (after the manager is resolved)', () => {
    expect(employee('E0005')).toMatchObject({
      unit: 'Laboratoře',
      unitInferred: true,
      managerId: 'E0002',
    });
  });

  it('keeps employees with an unknown manager and reports it', () => {
    expect(employee('E0006')?.managerId).toBeNull();
    expect(issuesFor('E0006')).toEqual(
      expect.arrayContaining(['neznamy-vedouci', 'nastup-v-budoucnu'])
    );
  });

  it('maps employment status and drops invalid e-mails', () => {
    expect(employee('E0004')?.status).toBe('parental_leave');
    expect(employee('E0005')).toMatchObject({
      status: 'terminated',
      endDate: '2026-03-01',
      email: null,
    });
  });

  it('flags formula injection in notes and does not import employee notes', () => {
    expect(issuesFor('E0003')).toContain('vzorec-v-poznamce');
    expect(JSON.stringify(dataset.employees)).not.toContain('HYPERLINK');
  });
});

describe('training records', () => {
  it('imports exactly the usable rows', () => {
    expect(dataset.records.map((r) => r.id)).toEqual([
      'Z000002',
      'Z000004',
      'Z000005',
      'Z000006',
      'Z000010',
      'Z000011',
      'Z000013',
    ]);
  });

  it.each([
    ['Z000001', 'zastupne-datum'],
    ['Z000003', 'duplicitni-zaznam'],
    ['Z000007', 'nesouhlasi-jmeno'],
    ['Z000008', 'neznamy-zamestnanec'],
    ['Z000009', 'neznamy-kod'],
    ['Z000012', 'datum-v-budoucnu'],
  ])('excludes %s (%s)', (id, type) => {
    expect(issuesFor(id)).toContain(type);
  });

  it('skips comment rows, repeated headers and the total row, and verifies the total', () => {
    const types = report.issues.filter((i) => i.file === 'absolvovana_skoleni').map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(['komentar', 'opakovana-hlavicka']));
    expect(report.issues.find((i) => i.type === 'kontrolni-soucet')).toMatchObject({
      severity: 'info',
    });
  });

  it('reassigns records of a merged duplicate and converts Excel serial dates', () => {
    expect(record('Z000004')).toMatchObject({
      employeeId: 'E0003',
      code: 'KYBER',
      completedOn: '2023-04-16',
      validUntil: '2024-04-16',
      costCzk: 380,
      provider: 'E-learning portál',
      note: 'řádek 1\r\nřádek 2; s "uvozovkami"',
    });
    expect(issuesFor('Z000004')).toContain('datum-excel');
  });

  it('normalizes code formatting and provider spelling', () => {
    expect(record('Z000002')).toMatchObject({
      code: 'BOZP-Z',
      provider: 'Interní školitel',
      validUntil: '2027-03-01',
    });
    expect(record('Z000010')?.code).toBe('KYBER');
    expect(issuesFor('Z000010')).toContain('preklep-v-kodu');
  });

  it('uses catalog validity when the exported expiry precedes completion', () => {
    expect(record('Z000005')?.validUntil).toBe('2027-01-10');
    expect(issuesFor('Z000005')).toContain('platnost-pred-absolvovanim');
  });

  it('uses the earlier date when exported expiry disagrees with the catalog', () => {
    expect(record('Z000006')).toMatchObject({ validUntil: '2026-01-10', costCzk: -600 });
    expect(issuesFor('Z000006')).toEqual(
      expect.arrayContaining(['platnost-rozpor', 'zaporna-cena'])
    );
  });

  it('treats one-off trainings as never expiring', () => {
    expect(record('Z000011')?.validUntil).toBeNull();
  });

  it('flags trainings completed after termination', () => {
    expect(issuesFor('Z000013')).toContain('po-ukonceni');
  });
});

describe('sessions', () => {
  it('drops sessions with impossible dates', () => {
    expect(session('T004')).toBeUndefined();
    expect(issuesFor('T004')).toContain('neplatne-datum');
  });

  it('marks duplicate sessions instead of counting their capacity twice', () => {
    expect(session('T002')?.duplicateOf).toBe('T001');
  });

  it('fixes the known code typo', () => {
    expect(session('T003')?.code).toBe('KYBER');
  });

  it('keeps cancelled, overbooked and zero-capacity sessions with flags', () => {
    expect(session('T005')).toMatchObject({ capacity: 30, booked: 31 });
    expect(issuesFor('T005')).toContain('preplneno');
    expect(session('T006')).toMatchObject({ cancelled: true, priceCzk: 2100 });
    expect(session('T007')).toMatchObject({ capacity: 0, priceCzk: null });
    expect(issuesFor('T007')).toEqual(expect.arrayContaining(['nulova-kapacita', 'chybi-cena']));
  });
});
