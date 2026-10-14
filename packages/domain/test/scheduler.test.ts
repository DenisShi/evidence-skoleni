import { describe, expect, it } from 'vitest';
import { evaluateCompliance } from '../src/compliance.ts';
import { bookableSessions, planEnrollments } from '../src/scheduler.ts';
import type { Employee, Session, TrainingRecord } from '../src/types.ts';
import { dataset, done, person, REF, session } from './builders.ts';

function plan(employees: Employee[], records: TrainingRecord[], sessions: Session[]) {
  const data = dataset(employees, records, sessions);
  return planEnrollments(
    data,
    evaluateCompliance(data, { referenceDate: REF, warningDays: 90 }),
    REF
  );
}

const seats = (result: ReturnType<typeof plan>) =>
  Object.fromEntries(result.sessions.map((s) => [s.session.id, s.assignedEmployeeIds]));

describe('bookableSessions', () => {
  it('keeps only future, active, unique sessions with capacity, ordered by date', () => {
    const sessions = [
      session('S1', 'BOZP-Z', REF),
      session('S2', 'BOZP-Z', '2026-10-21', { cancelled: true }),
      session('S3', 'BOZP-Z', '2026-10-22', { duplicateOf: 'S6' }),
      session('S4', 'BOZP-Z', '2026-10-23', { capacity: 0 }),
      session('S5', 'BOZP-Z', '2026-11-01'),
      session('S6', 'BOZP-Z', '2026-10-20'),
    ];
    expect(bookableSessions(sessions, REF).map((s) => s.id)).toEqual(['S6', 'S5']);
  });
});

describe('planEnrollments', () => {
  it('serves the earliest deadline first', () => {
    const result = plan(
      [person('E1'), person('E2')],
      [
        done('E1', 'BOZP-Z', '2024-12-01', '2026-12-01'), // expiring
        done('E2', 'BOZP-Z', '2024-01-01', '2026-01-01'), // expired
      ],
      [
        session('A', 'BOZP-Z', '2026-10-20', { capacity: 1 }),
        session('B', 'BOZP-Z', '2026-11-20', { capacity: 1 }),
      ]
    );
    expect(seats(result)).toEqual({ A: ['E2'], B: ['E1'] });
    expect(result.assignments.map((a) => [a.employeeId, a.timing])).toEqual([
      ['E2', 'overdue'],
      ['E1', 'on-time'],
    ]);
  });

  it('respects free seats and reports the people left without one', () => {
    const result = plan(
      [person('E1'), person('E2'), person('E3')],
      [],
      [session('A', 'BOZP-Z', '2026-10-20', { capacity: 10, booked: 8 })]
    );
    expect(seats(result)).toEqual({ A: ['E1', 'E2'] });
    expect(result.unassigned).toEqual([
      { employeeId: 'E3', code: 'BOZP-Z', status: 'missing', deadline: REF, reason: 'no-capacity' },
    ]);
    expect(result.shortages).toEqual([
      { code: 'BOZP-Z', withoutSeat: 1, late: 0, earliestDeadline: REF },
    ]);
  });

  it('treats overbooked sessions as full', () => {
    const result = plan(
      [person('E1')],
      [],
      [session('A', 'BOZP-Z', '2026-10-20', { capacity: 30, booked: 31 })]
    );
    expect(result.sessions[0]?.freeSeats).toBe(0);
    expect(result.unassigned[0]?.reason).toBe('no-capacity');
  });

  it('reports a missing session separately from a full one', () => {
    const result = plan([person('E1')], [], []);
    expect(result.unassigned[0]?.reason).toBe('no-session');
  });

  it('does not plan people on parental leave and does not count them as shortage', () => {
    const result = plan(
      [person('E1', { status: 'parental_leave' })],
      [],
      [session('A', 'BOZP-Z', '2026-10-20')]
    );
    expect(result.assignments).toEqual([]);
    expect(result.unassigned[0]?.reason).toBe('parental-leave');
    expect(result.shortages).toEqual([]);
  });

  it('books newcomers only from their start date and does not count them as shortage', () => {
    const result = plan(
      [person('E1', { startDate: '2026-11-02' })],
      [],
      [session('A', 'BOZP-Z', '2026-10-20'), session('B', 'BOZP-Z', '2026-11-10')]
    );
    expect(result.assignments).toMatchObject([
      { sessionId: 'B', deadline: '2026-11-02', timing: 'after-start' },
    ]);
    // An extra session before the start date would not help – the person is not employed yet.
    expect(result.shortages).toEqual([]);
  });

  it('flags a session after the deadline as late and reports it as shortage', () => {
    const result = plan(
      [person('E1')],
      [done('E1', 'BOZP-Z', '2024-11-01', '2026-11-01')],
      [session('A', 'BOZP-Z', '2026-11-20')]
    );
    expect(result.assignments[0]?.timing).toBe('late');
    expect(result.shortages).toEqual([
      { code: 'BOZP-Z', withoutSeat: 0, late: 1, earliestDeadline: '2026-11-01' },
    ]);
  });

  it('does not book leavers after their last day', () => {
    const result = plan(
      [person('E1', { endDate: '2026-11-01' })],
      [done('E1', 'BOZP-Z', '2024-01-01', '2026-01-01')],
      [session('A', 'BOZP-Z', '2026-11-20')]
    );
    expect(result.unassigned[0]?.reason).toBe('no-session');
  });

  it('does not put one person into two sessions on the same day', () => {
    const laborant = person('E1', { unit: 'Laboratoře', position: 'Laborant' });
    const result = plan(
      [laborant],
      [],
      [
        session('B1', 'BOZP-Z', '2026-10-20'),
        session('L1', 'LAB-BEZ', '2026-10-20'),
        session('L2', 'LAB-BEZ', '2026-10-27'),
      ]
    );
    expect(seats(result)).toEqual({ B1: ['E1'], L1: [], L2: ['E1'] });
  });

  it('sums the cost and counts assignments with unknown price', () => {
    const result = plan(
      [person('E1'), person('E2')],
      [],
      [
        session('A', 'BOZP-Z', '2026-10-20', { capacity: 1, priceCzk: 450 }),
        session('B', 'BOZP-Z', '2026-10-27', { capacity: 1, priceCzk: null }),
      ]
    );
    expect(result.totalCostCzk).toBe(450);
    expect(result.assignmentsWithoutPrice).toBe(1);
  });

  it('is deterministic regardless of input order', () => {
    const employees = ['E1', 'E2', 'E3', 'E4'].map((id) => person(id));
    const sessions = [
      session('A', 'BOZP-Z', '2026-10-20', { capacity: 2 }),
      session('B', 'BOZP-Z', '2026-11-20', { capacity: 1 }),
    ];
    const forward = plan(employees, [], sessions);
    const reversed = plan([...employees].reverse(), [], [...sessions].reverse());
    expect(reversed.assignments).toEqual(forward.assignments);
    expect(reversed.unassigned).toEqual(forward.unassigned);
  });
});
