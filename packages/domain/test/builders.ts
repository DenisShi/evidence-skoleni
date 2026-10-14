import type { Dataset, Employee, Session, TrainingRecord, TrainingType } from '../src/types.ts';

export const REF = '2026-10-14';

export const types: TrainingType[] = [
  { code: 'BOZP-Z', name: 'BOZP', validityMonths: 24, requirement: { kind: 'all' } },
  {
    code: 'LAB-BEZ',
    name: 'Lab',
    validityMonths: 24,
    requirement: { kind: 'units', units: ['Laboratoře'] },
  },
  {
    code: 'LEAD',
    name: 'Vedení lidí',
    validityMonths: null,
    requirement: { kind: 'positions', positions: ['Vedoucí'] },
  },
  { code: 'ANGL', name: 'Angličtina', validityMonths: null, requirement: { kind: 'optional' } },
];

export function person(id: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    firstName: 'Jan',
    lastName: `Novák ${id}`,
    email: null,
    unit: 'Knihovna',
    unitInferred: false,
    position: 'Knihovník',
    managerId: null,
    startDate: '2015-01-01',
    endDate: null,
    status: 'active',
    mergedIds: [],
    ...overrides,
  };
}

let recordSeq = 0;
export function done(
  employeeId: string,
  code: string,
  completedOn: string,
  validUntil: string | null
): TrainingRecord {
  return {
    id: `Z${++recordSeq}`,
    employeeId,
    code,
    completedOn,
    validUntil,
    provider: 'Interní školitel',
    costCzk: 0,
    note: '',
  };
}

export function session(
  id: string,
  code: string,
  date: string,
  overrides: Partial<Session> = {}
): Session {
  return {
    id,
    code,
    date,
    time: '09:00-12:00',
    place: 'Aula A',
    capacity: 10,
    booked: 0,
    priceCzk: 500,
    cancelled: false,
    duplicateOf: null,
    ...overrides,
  };
}

export function dataset(
  employees: Employee[],
  records: TrainingRecord[] = [],
  sessions: Session[] = []
): Dataset {
  return { exportDate: '2026-10-01', employees, trainingTypes: types, records, sessions };
}
