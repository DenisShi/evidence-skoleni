import type { EmployeeDetail, Meta, PlanResponse } from '@evidence/api/dto';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanPrihlasek } from '../src/pages/PlanPrihlasek.tsx';
import { ZamestnanecDetail } from '../src/pages/ZamestnanecDetail.tsx';
import { renderPage } from './render.tsx';

const meta: Meta = {
  exportDate: '2026-10-01',
  today: '2026-10-14',
  defaultWarningDays: 90,
  units: ['Laboratoře'],
  trainingTypes: [
    {
      code: 'KYBER',
      name: 'Kybernetická bezpečnost',
      validityMonths: 12,
      requirement: { kind: 'all' },
    },
  ],
  managers: [],
};

const person = {
  id: 'E0003',
  name: 'Novák Karel',
  unit: 'Laboratoře',
  position: 'Laborant',
  state: 'active',
} as const;

const detail: EmployeeDetail = {
  id: 'E0003',
  firstName: 'Karel',
  lastName: 'Novák',
  email: 'karel.novak@test.example',
  unit: 'Laboratoře',
  unitInferred: true,
  position: 'Laborant',
  manager: null,
  startDate: '2019-08-03',
  endDate: null,
  state: 'active',
  mergedIds: ['E1000'],
  requirements: [
    {
      code: 'KYBER',
      name: 'Kybernetická bezpečnost',
      status: 'expired',
      lastCompletedOn: '2025-05-05',
      validUntil: '2026-05-05',
      deadline: '2026-05-05',
      daysLeft: -162,
      needsAction: true,
      waivedReason: null,
      planned: { sessionId: 'T001', date: '2026-11-11', timing: 'overdue' },
    },
  ],
  history: [
    {
      id: 'Z000002',
      code: 'KYBER',
      completedOn: '2025-05-05',
      validUntil: '2026-05-05',
      provider: 'Interní školitel',
      // Notes come from the export as they are; they must never be interpreted as markup.
      note: '<img src=x onerror="alert(1)"> =HYPERLINK("x")',
    },
  ],
  issues: [
    {
      file: 'zamestnanci',
      ref: 'E1000',
      type: 'duplicitni-zamestnanec',
      severity: 'warning',
      message: 'Stejná osoba jako E0003 - záznam sloučen.',
    },
  ],
};

const plan: PlanResponse = {
  referenceDate: '2026-12-01',
  sessions: [
    {
      id: 'T001',
      code: 'KYBER',
      name: 'Kybernetická bezpečnost',
      date: '2026-12-11',
      time: '09:00',
      place: 'Učebna 1',
      capacity: 10,
      booked: 9,
      freeSeats: 1,
      priceCzk: 1500,
      assigned: [{ ...person, status: 'expired', deadline: '2026-05-05', timing: 'overdue' }],
    },
  ],
  unusableSessions: [{ id: 'T006', code: 'KYBER', date: '2026-12-20', reason: 'cancelled' }],
  unassigned: [
    {
      ...person,
      id: 'E0004',
      name: 'Malá Eva',
      code: 'KYBER',
      status: 'missing',
      deadline: '2026-12-01',
      reason: 'no-capacity',
    },
  ],
  shortages: [{ code: 'KYBER', withoutSeat: 1, late: 0, earliestDeadline: '2026-12-01' }],
  totalCostCzk: 1500,
  assignmentsWithoutPrice: 0,
};

afterEach(() => vi.unstubAllGlobals());

describe('Zaměstnanec - detail', () => {
  const renderDetail = (url: string) =>
    renderPage('/zamestnanci/:id', <ZamestnanecDetail />, url, {
      '/api/employees/E0003': detail,
    });

  it('shows requirements, the recommended session and data findings', async () => {
    renderDetail('/zamestnanci/E0003');
    expect(await screen.findByText(/Novák Karel/)).toBeInTheDocument();
    expect(screen.getByText(/sloučeno s E1000/)).toBeInTheDocument();
    expect(screen.getByText('odvozeno')).toBeInTheDocument();
    expect(screen.getByText(/T001, 11\. 11\. 2026/)).toBeInTheDocument();
    expect(screen.getByText('Stejná osoba jako E0003 - záznam sloučen.')).toBeInTheDocument();
  });

  it('renders notes from the export as plain text, not as HTML', async () => {
    renderDetail('/zamestnanci/E0003');
    expect(await screen.findByText(detail.history[0]!.note)).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('says the employee does not exist instead of a generic error', async () => {
    renderDetail('/zamestnanci/E9999');
    expect(await screen.findByText('Záznam neexistuje')).toBeInTheDocument();
  });
});

describe('Plán přihlášek', () => {
  const renderPlan = (url: string) =>
    renderPage('/plan', <PlanPrihlasek />, url, { '/api/plan': plan, '/api/meta': meta });

  it('summarizes the plan and advises where an extra session is needed', async () => {
    renderPlan('/plan?asOf=2026-12-01');
    expect(await screen.findByText(/Doporučené přihlášky: 1/)).toBeInTheDocument();
    expect(screen.getByText(/1\s500 Kč/)).toBeInTheDocument();
    expect(
      screen.getByText('Vypsat další termín (aspoň 1 místo) nejlépe do 1. 12. 2026.')
    ).toBeInTheDocument();
    expect(screen.getByText('Všechny termíny jsou plné')).toBeInTheDocument();
    expect(screen.getByText('Zrušen')).toBeInTheDocument();
  });

  it('downloads the CSV for the same reference date', async () => {
    const fetchMock = renderPlan('/plan?asOf=2026-12-01');
    const link = await screen.findByRole('link', { name: /Stáhnout plán/ });
    expect(link).toHaveAttribute('href', '/api/plan.csv?asOf=2026-12-01');
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      '/api/plan?asOf=2026-12-01'
    );
  });
});
