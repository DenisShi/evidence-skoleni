import type { EmployeeCompliance, EmployeeState, RequirementState } from './compliance.ts';
import { addDays } from './dates.ts';
import type { Dataset, Employee, IsoDate, Session } from './types.ts';

/**
 * - `overdue`: already expired/missing at the reference date – any session is as soon as possible.
 * - `on-time`: the session is on or before the deadline.
 * - `late`: the deadline is still ahead, but no seat was available before it.
 */
export type Timing = 'overdue' | 'on-time' | 'late';

export interface Assignment {
  sessionId: string;
  sessionDate: IsoDate;
  employeeId: string;
  code: string;
  status: RequirementState;
  deadline: IsoDate;
  timing: Timing;
  priceCzk: number | null;
}

/**
 * - `parental-leave`: the person cannot attend now; has to be planned on return.
 * - `no-session`: no usable session of this training in the window the person can attend.
 * - `no-capacity`: sessions exist but are full.
 */
export type UnassignedReason = 'parental-leave' | 'no-session' | 'no-capacity';

export interface UnassignedNeed {
  employeeId: string;
  code: string;
  status: RequirementState;
  deadline: IsoDate;
  reason: UnassignedReason;
}

export interface SessionPlan {
  session: Session;
  /** Free seats according to the export (capacity − booked, never negative). */
  freeSeats: number;
  assignedEmployeeIds: string[];
}

export interface Shortage {
  code: string;
  /** People who could attend but got no seat at all. */
  withoutSeat: number;
  /** People who got a seat only after their deadline. */
  late: number;
  /** Earliest deadline among them – an extra session should take place before it. */
  earliestDeadline: IsoDate;
}

export interface EnrollmentPlan {
  assignments: Assignment[];
  sessions: SessionPlan[];
  unassigned: UnassignedNeed[];
  shortages: Shortage[];
  totalCostCzk: number;
  /** Assignments to sessions without a known price (not included in the total). */
  assignmentsWithoutPrice: number;
}

interface Need {
  employee: Employee;
  state: EmployeeState;
  code: string;
  status: RequirementState;
  deadline: IsoDate;
}

const URGENCY: Record<RequirementState, number> = { expired: 0, missing: 1, expiring: 2, ok: 3 };

/**
 * Greedy earliest-deadline-first: needs are taken in order of their deadline and each gets the
 * earliest session with a free seat that the person can attend. With all needs known up front and
 * unit-size demands, this order maximizes the number of people trained before their deadline,
 * and taking the earliest seat leaves later sessions as a fallback for anyone who misses theirs.
 * The plan is deterministic: ties are broken by urgency, then employee ID.
 */
export function planEnrollments(
  dataset: Dataset,
  evaluations: EmployeeCompliance[],
  referenceDate: IsoDate
): EnrollmentPlan {
  const needs = collectNeeds(evaluations);
  const sessionPlans = bookableSessions(dataset.sessions, referenceDate).map((session) => ({
    session,
    freeSeats: Math.max(0, session.capacity - session.booked),
    assignedEmployeeIds: [] as string[],
  }));
  const plansByCode = Map.groupBy(sessionPlans, (p) => p.session.code);
  const busyDates = new Map<string, Set<IsoDate>>();

  const assignments: Assignment[] = [];
  const unassigned: UnassignedNeed[] = [];

  for (const need of needs) {
    const { employee, code, status, deadline } = need;
    const unassign = (reason: UnassignedReason) =>
      unassigned.push({ employeeId: employee.id, code, status, deadline, reason });

    if (need.state === 'parental_leave') {
      unassign('parental-leave');
      continue;
    }

    // Newcomers can attend from their first day; leavers only until their last day.
    const notBefore = maxDate(addDays(referenceDate, 1), employee.startDate);
    const notAfter = need.state === 'leaving' ? employee.endDate : null;
    const window = (plansByCode.get(code) ?? []).filter(
      (p) => p.session.date >= notBefore && (notAfter === null || p.session.date <= notAfter)
    );
    if (window.length === 0) {
      unassign('no-session');
      continue;
    }

    const personDates = busyDates.get(employee.id) ?? new Set<IsoDate>();
    const chosen = window.find(
      (p) => p.assignedEmployeeIds.length < p.freeSeats && !personDates.has(p.session.date)
    );
    if (!chosen) {
      unassign('no-capacity');
      continue;
    }

    chosen.assignedEmployeeIds.push(employee.id);
    personDates.add(chosen.session.date);
    busyDates.set(employee.id, personDates);
    assignments.push({
      sessionId: chosen.session.id,
      sessionDate: chosen.session.date,
      employeeId: employee.id,
      code,
      status,
      deadline,
      timing:
        deadline <= referenceDate
          ? 'overdue'
          : chosen.session.date <= deadline
            ? 'on-time'
            : 'late',
      priceCzk: chosen.session.priceCzk,
    });
  }

  return {
    assignments,
    sessions: sessionPlans,
    unassigned,
    shortages: computeShortages(assignments, unassigned),
    totalCostCzk: assignments.reduce((sum, a) => sum + (a.priceCzk ?? 0), 0),
    assignmentsWithoutPrice: assignments.filter((a) => a.priceCzk === null).length,
  };
}

/** Sessions a person could still be enrolled in: future, not cancelled, not a duplicate row. */
export function bookableSessions(sessions: Session[], referenceDate: IsoDate): Session[] {
  return sessions
    .filter(
      (s) => s.date > referenceDate && !s.cancelled && s.duplicateOf === null && s.capacity > 0
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id)
    );
}

function collectNeeds(evaluations: EmployeeCompliance[]): Need[] {
  return evaluations
    .flatMap(({ employee, state, requirements }) =>
      requirements
        .filter((r) => r.needsAction && r.deadline !== null)
        .map((r) => ({ employee, state, code: r.code, status: r.status, deadline: r.deadline! }))
    )
    .sort(
      (a, b) =>
        a.deadline.localeCompare(b.deadline) ||
        URGENCY[a.status] - URGENCY[b.status] ||
        a.employee.id.localeCompare(b.employee.id) ||
        a.code.localeCompare(b.code)
    );
}

function computeShortages(assignments: Assignment[], unassigned: UnassignedNeed[]): Shortage[] {
  const byCode = new Map<string, Shortage>();
  const touch = (code: string, deadline: IsoDate) => {
    const shortage = byCode.get(code) ?? {
      code,
      withoutSeat: 0,
      late: 0,
      earliestDeadline: deadline,
    };
    if (deadline < shortage.earliestDeadline) shortage.earliestDeadline = deadline;
    byCode.set(code, shortage);
    return shortage;
  };
  for (const need of unassigned) {
    if (need.reason !== 'parental-leave') touch(need.code, need.deadline).withoutSeat++;
  }
  for (const assignment of assignments) {
    if (assignment.timing === 'late') touch(assignment.code, assignment.deadline).late++;
  }
  return [...byCode.values()].sort((a, b) => a.earliestDeadline.localeCompare(b.earliestDeadline));
}

function maxDate(a: IsoDate, b: IsoDate | null): IsoDate {
  return b !== null && b > a ? b : a;
}
