import type { ActionItemDto, Meta } from '@evidence/api/dto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoResit } from '../src/pages/CoResit.tsx';

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

const actions: ActionItemDto[] = [
  {
    employee: {
      id: 'E0003',
      name: 'Novák Karel',
      unit: 'Laboratoře',
      position: 'Laborant',
      state: 'active',
    },
    code: 'KYBER',
    status: 'expired',
    lastCompletedOn: '2025-05-05',
    validUntil: '2026-05-05',
    deadline: '2026-05-05',
    daysLeft: -162,
    planned: { sessionId: 'T001', date: '2026-11-11', timing: 'overdue' },
    unplannedReason: null,
  },
  {
    employee: {
      id: 'E0004',
      name: 'Malá Eva',
      unit: 'Laboratoře',
      position: 'Laborant',
      state: 'parental_leave',
    },
    code: 'KYBER',
    status: 'missing',
    lastCompletedOn: null,
    validUntil: null,
    deadline: '2026-10-14',
    daysLeft: 0,
    planned: null,
    unplannedReason: 'parental-leave',
  },
];

afterEach(() => vi.unstubAllGlobals());

function renderAt(url: string) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    const body = path.startsWith('/api/meta') ? meta : actions;
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const router = createMemoryRouter([{ path: '/co-resit', element: <CoResit /> }], {
    initialEntries: [url],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return fetchMock;
}

describe('Co řešit', () => {
  it('shows each need with status, deadline and the recommended session', async () => {
    renderAt('/co-resit');
    expect(await screen.findByText('Novák Karel')).toBeInTheDocument();
    expect(screen.getByText('Prošlé')).toBeInTheDocument();
    expect(screen.getByText('162 dní po termínu')).toBeInTheDocument();
    expect(screen.getByText(/T001, 11\. 11\. 2026/)).toBeInTheDocument();
    expect(screen.getByText('Na rodičovské - naplánovat po návratu')).toBeInTheDocument();
  });

  it('passes the reference date and filters from the URL to the API', async () => {
    const fetchMock = renderAt('/co-resit?asOf=2026-12-01&unit=Laborato%C5%99e&status=expired');
    await screen.findByText('Novák Karel');
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain('/api/actions?asOf=2026-12-01&unit=Laborato%C5%99e&status=expired');
  });
});
