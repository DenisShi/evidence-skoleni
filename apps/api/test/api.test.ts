import { describe, expect, it } from 'vitest';
import type {
  ActionItemDto,
  EmployeeDetail,
  EmployeeListItem,
  Meta,
  OverviewResponse,
  PlanResponse,
} from '../src/dto.ts';
import { testApp, TODAY } from './helpers.ts';

const app = testApp();
const get = async <T>(url: string) => {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json<T>(), headers: res.headers };
};

describe('GET /api/health', () => {
  it('responds ok', async () => {
    expect(await get('/api/health')).toMatchObject({ status: 200, body: { status: 'ok' } });
  });
});

describe('GET /api/meta', () => {
  it('lists units, trainings and managers for filters', async () => {
    const { body } = await get<Meta>('/api/meta');
    expect(body).toMatchObject({ exportDate: '2026-10-01', today: TODAY, defaultWarningDays: 90 });
    expect(body.units).toEqual(['Laboratoře', 'Vedení']);
    expect(body.trainingTypes.map((t) => t.code)).toEqual(['BOZP-Z', 'KYBER', 'LAB-BEZ', 'LEAD']);
    expect(body.managers.map((m) => m.id)).toEqual(['E0002', 'E0001']);
  });
});

describe('GET /api/overview', () => {
  it('evaluates as of today by default', async () => {
    const { body } = await get<OverviewResponse>('/api/overview');
    expect(body).toMatchObject({ referenceDate: TODAY, warningDays: 90 });
    expect(body.employeesByState).toMatchObject({ parental_leave: 1, terminated: 1, starting: 1 });
  });

  it('accepts another reference date and warning window', async () => {
    const { body } = await get<OverviewResponse>('/api/overview?asOf=2027-06-01&warningDays=30');
    expect(body).toMatchObject({ referenceDate: '2027-06-01', warningDays: 30 });
  });

  it.each(['asOf=2026-02-30', 'asOf=14.10.2026', 'warningDays=0', 'warningDays=abc'])(
    'rejects invalid query %s',
    async (query) => {
      expect((await get(`/api/overview?${query}`)).status).toBe(400);
    }
  );
});

describe('GET /api/actions', () => {
  it('lists needs with the planned session', async () => {
    const { body } = await get<ActionItemDto[]>('/api/actions');
    const karel = body.find((a) => a.employee.id === 'E0003' && a.code === 'KYBER');
    expect(karel).toMatchObject({
      status: 'expired',
      planned: { sessionId: 'T001', date: '2026-11-11' },
    });
  });

  it("filters by a manager's whole team (direct and indirect reports)", async () => {
    const { body } = await get<ActionItemDto[]>('/api/actions?managerId=E0001');
    const ids = new Set(body.map((a) => a.employee.id));
    // E0002 reports to E0001; E0003 and E0004 report to E0002. E0005 left, E0006 has an unknown manager.
    expect([...ids].sort()).toEqual(['E0002', 'E0003', 'E0004']);
  });

  it('filters by training and status', async () => {
    const { body } = await get<ActionItemDto[]>('/api/actions?code=KYBER&status=missing');
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((a) => a.code === 'KYBER' && a.status === 'missing')).toBe(true);
  });

  it('explains why people on parental leave are not planned', async () => {
    const { body } = await get<ActionItemDto[]>('/api/actions?state=parental_leave');
    expect(body.every((a) => a.planned === null && a.unplannedReason === 'parental-leave')).toBe(
      true
    );
  });
});

describe('GET /api/employees', () => {
  it('lists everybody including terminated, with the worst status', async () => {
    const { body } = await get<EmployeeListItem[]>('/api/employees');
    expect(body).toHaveLength(6);
    expect(body.find((e) => e.id === 'E0005')).toMatchObject({ state: 'terminated', required: 0 });
    expect(body.find((e) => e.id === 'E0003')).toMatchObject({
      managerName: 'Horáková Lenka',
      worstStatus: 'expired',
    });
  });

  it('searches by name without diacritics', async () => {
    const { body } = await get<EmployeeListItem[]>('/api/employees?q=horakova');
    expect(body.map((e) => e.id)).toEqual(['E0002']);
  });
});

describe('GET /api/employees/:id', () => {
  it('returns requirements, history and data issues incl. the merged duplicate', async () => {
    const { body } = await get<EmployeeDetail>('/api/employees/E0003');
    expect(body).toMatchObject({ id: 'E0003', mergedIds: ['E1000'], manager: { id: 'E0002' } });
    expect(body.history.map((h) => h.id)).toEqual(['Z000002', 'Z000004']);
    expect(body.issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(['duplicitni-zamestnanec', 'vzorec-v-poznamce', 'datum-excel'])
    );
  });

  it('answers 404 for unknown and 400 for malformed IDs or dates', async () => {
    expect((await get('/api/employees/E9999')).status).toBe(404);
    expect((await get('/api/employees/robert')).status).toBe(400);
    expect((await get('/api/employees/E0003?asOf=2026-13-01')).status).toBe(400);
  });

  it('finds a merged duplicate under the surviving ID only', async () => {
    expect((await get('/api/employees/E1000')).status).toBe(404);
  });
});

describe('GET /api/plan', () => {
  it('returns sessions with assignments and explains unusable ones', async () => {
    const { body } = await get<PlanResponse>('/api/plan');
    expect(body.sessions.map((s) => s.id)).toEqual(['T005', 'T001', 'T003']);
    expect(body.unusableSessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'T002', reason: 'duplicate' }),
        expect.objectContaining({ id: 'T006', reason: 'cancelled' }),
        expect.objectContaining({ id: 'T007', reason: 'no-capacity' }),
      ])
    );
    expect(body.sessions.find((s) => s.id === 'T005')).toMatchObject({
      freeSeats: 0,
      assigned: [],
    });
  });
});

describe('GET /api/plan.csv', () => {
  it('downloads a semicolon CSV with BOM for Excel', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/plan.csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`plan-prihlasek-${TODAY}.csv`);
    expect(res.body.charCodeAt(0)).toBe(0xfeff);
    expect(res.body.split('\r\n')[0]).toContain('Termín;Kód;Školení');
  });

  it('has one row per recommended enrollment', async () => {
    const plan = (await get<PlanResponse>('/api/plan?asOf=2026-10-20')).body;
    const res = await app.inject({ url: '/api/plan.csv?asOf=2026-10-20' });
    const rows = res.body.trimEnd().split('\r\n').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(plan.sessions.reduce((n, s) => n + s.assigned.length, 0));
    expect(res.headers['content-disposition']).toContain('plan-prihlasek-2026-10-20.csv');
  });

  it('rejects an invalid reference date instead of putting it into the file name', async () => {
    const res = await app.inject({ url: '/api/plan.csv?asOf=..%2F..%2Fetc' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/data-quality', () => {
  it('returns the import report', async () => {
    const { body } = await get<{ files: unknown[]; issues: unknown[] }>('/api/data-quality');
    expect(body.files).toHaveLength(4);
    expect(body.issues.length).toBeGreaterThan(10);
  });
});

describe('sensitive data', () => {
  it('never returns birth numbers or employee notes from any endpoint', async () => {
    const urls = [
      '/api/meta',
      '/api/overview',
      '/api/actions',
      '/api/employees',
      '/api/employees/E0003',
      '/api/plan',
      '/api/plan.csv',
      '/api/data-quality',
    ];
    for (const url of urls) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.body, url).not.toMatch(/000101\/000\d/);
      expect(res.body, url).not.toContain('HYPERLINK');
    }
  });

  it('sets security headers and disables caching of API responses', async () => {
    const { headers } = await get('/api/overview');
    expect(headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'cache-control': 'no-store',
    });
  });

  it('limits the length of free-text filters', async () => {
    expect((await get(`/api/employees?q=${'a'.repeat(101)}`)).status).toBe(400);
  });

  it('answers unknown API paths with 404', async () => {
    expect((await get('/api/nope')).status).toBe(404);
  });
});
