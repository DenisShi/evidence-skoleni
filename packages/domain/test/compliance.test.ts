import { describe, expect, it } from 'vitest';
import { employeeState, evaluateCompliance, isRequired } from '../src/compliance.ts';
import { actionItems, buildOverview } from '../src/overview.ts';
import type { Employee, TrainingRecord, TrainingType } from '../src/types.ts';
import { dataset, done, person, REF, types } from './builders.ts';

const options = { referenceDate: REF, warningDays: 90 };

function evaluate(employees: Employee[], records: TrainingRecord[]) {
  return evaluateCompliance(dataset(employees, records), options);
}

function statusOf(employee: Employee, records: TrainingRecord[], code = 'BOZP-Z') {
  const [result] = evaluate([employee], records);
  return result?.requirements.find((r) => r.code === code);
}

describe('employeeState', () => {
  it.each([
    [{}, 'active'],
    [{ status: 'terminated' as const, endDate: '2026-03-01' }, 'terminated'],
    [{ endDate: '2026-09-30' }, 'terminated'],
    [{ endDate: '2027-01-20' }, 'leaving'],
    [{ status: 'parental_leave' as const }, 'parental_leave'],
    [{ startDate: '2026-11-02' }, 'starting'],
  ])('%o → %s', (overrides, state) => {
    expect(employeeState(person('E1', overrides), REF)).toBe(state);
  });
});

describe('isRequired', () => {
  const [bozp, lab, lead, angl] = types as [TrainingType, TrainingType, TrainingType, TrainingType];

  it('applies rules for everyone, units and positions', () => {
    const laborant = person('E1', { unit: 'Laboratoře', position: 'Laborant' });
    expect(isRequired(bozp, laborant)).toBe(true);
    expect(isRequired(lab, laborant)).toBe(true);
    expect(isRequired(lab, person('E2'))).toBe(false);
    expect(isRequired(angl, laborant)).toBe(false);
  });

  it('matches positions regardless of case and diacritics', () => {
    expect(isRequired(lead, person('E1', { position: 'VEDOUCI' }))).toBe(true);
  });

  it('does not require unit trainings when the unit is unknown', () => {
    expect(isRequired(lab, person('E1', { unit: null }))).toBe(false);
  });
});

describe('requirement status', () => {
  it('is ok when valid beyond the warning window', () => {
    expect(
      statusOf(person('E1'), [done('E1', 'BOZP-Z', '2026-01-01', '2028-01-01')])
    ).toMatchObject({
      status: 'ok',
      deadline: null,
      needsAction: false,
    });
  });

  it('is expiring within the warning window, with days left', () => {
    expect(
      statusOf(person('E1'), [done('E1', 'BOZP-Z', '2024-12-01', '2026-12-01')])
    ).toMatchObject({
      status: 'expiring',
      deadline: '2026-12-01',
      daysLeft: 48,
      needsAction: true,
    });
  });

  it('treats the last day of the window as expiring and the next day as ok', () => {
    expect(statusOf(person('E1'), [done('E1', 'BOZP-Z', '2025-01-12', '2027-01-12')])?.status).toBe(
      'expiring'
    );
    expect(statusOf(person('E1'), [done('E1', 'BOZP-Z', '2025-01-13', '2027-01-13')])?.status).toBe(
      'ok'
    );
  });

  it('is expired with a negative number of days', () => {
    expect(
      statusOf(person('E1'), [done('E1', 'BOZP-Z', '2024-10-01', '2026-10-01')])
    ).toMatchObject({
      status: 'expired',
      daysLeft: -13,
    });
  });

  it('is missing with an immediate deadline when never completed', () => {
    expect(statusOf(person('E1'), [])).toMatchObject({
      status: 'missing',
      lastCompletedOn: null,
      deadline: REF,
      daysLeft: 0,
    });
  });

  it('uses the record that is valid the longest, not the last one in the file', () => {
    const records = [
      done('E1', 'BOZP-Z', '2025-06-01', '2027-06-01'),
      done('E1', 'BOZP-Z', '2019-01-01', '2021-01-01'),
    ];
    expect(statusOf(person('E1'), records)).toMatchObject({
      status: 'ok',
      validUntil: '2027-06-01',
    });
  });

  it('never expires one-off trainings', () => {
    const boss = person('E1', { position: 'Vedoucí' });
    expect(statusOf(boss, [done('E1', 'LEAD', '2015-03-01', null)], 'LEAD')).toMatchObject({
      status: 'ok',
      validUntil: null,
      lastCompletedOn: '2015-03-01',
    });
    expect(statusOf(boss, [], 'LEAD')?.status).toBe('missing');
  });

  it('gives newcomers their start date as deadline', () => {
    expect(statusOf(person('E1', { startDate: '2026-11-02' }), [])).toMatchObject({
      status: 'missing',
      deadline: '2026-11-02',
      daysLeft: 19,
      needsAction: true,
    });
  });

  it('waives renewals that would expire after the employee leaves', () => {
    const leaving = person('E1', { endDate: '2027-01-05' });
    expect(statusOf(leaving, [done('E1', 'BOZP-Z', '2025-01-10', '2027-01-10')])).toMatchObject({
      status: 'expiring',
      needsAction: false,
      waivedReason: 'leaves-before-deadline',
    });
    expect(statusOf(leaving, [done('E1', 'BOZP-Z', '2024-12-01', '2026-12-01')])).toMatchObject({
      needsAction: true,
      waivedReason: null,
    });
  });

  it('does not evaluate terminated employees', () => {
    const [result] = evaluate([person('E1', { status: 'terminated', endDate: '2026-01-01' })], []);
    expect(result).toMatchObject({ state: 'terminated', requirements: [] });
  });

  it('ignores optional trainings', () => {
    const [result] = evaluate([person('E1')], [done('E1', 'ANGL', '2025-01-01', null)]);
    expect(result?.requirements.map((r) => r.code)).toEqual(['BOZP-Z']);
  });
});

describe('overview and action items', () => {
  const employees = [
    person('E1', { unit: 'Laboratoře', position: 'Laborant' }),
    person('E2'),
    person('E3', { status: 'parental_leave' }),
    person('E4', { status: 'terminated', endDate: '2026-01-01' }),
  ];
  const records = [
    done('E1', 'BOZP-Z', '2026-01-01', '2028-01-01'),
    done('E1', 'LAB-BEZ', '2024-11-01', '2026-11-01'),
    done('E2', 'BOZP-Z', '2024-01-01', '2026-01-01'),
  ];
  const evaluations = evaluate(employees, records);

  it('counts employees by state and requirements of people at work only', () => {
    const overview = buildOverview(evaluations);
    expect(overview.employeesByState).toEqual({
      active: 2,
      starting: 0,
      leaving: 0,
      parental_leave: 1,
      terminated: 1,
    });
    expect(overview.totals).toEqual({
      total: 3,
      ok: 1,
      expiring: 1,
      expired: 1,
      missing: 0,
      needsAction: 2,
    });
  });

  it('aggregates by training, by unit and by unit × training', () => {
    const overview = buildOverview(evaluations);
    expect(overview.byTraining.find((t) => t.code === 'BOZP-Z')).toMatchObject({
      total: 2,
      ok: 1,
      expired: 1,
    });
    expect(overview.byUnit.map((u) => u.unit)).toEqual(['Knihovna', 'Laboratoře']);
    expect(overview.matrix).toContainEqual(
      expect.objectContaining({ unit: 'Laboratoře', code: 'LAB-BEZ', expiring: 1 })
    );
  });

  it('lists what needs action, most urgent first, including people on leave', () => {
    expect(actionItems(evaluations).map((a) => [a.employee.id, a.code, a.status])).toEqual([
      ['E2', 'BOZP-Z', 'expired'],
      ['E3', 'BOZP-Z', 'missing'],
      ['E1', 'LAB-BEZ', 'expiring'],
    ]);
  });
});
