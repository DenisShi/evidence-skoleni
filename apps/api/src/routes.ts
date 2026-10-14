import { DEFAULT_WARNING_DAYS, formatCz, parseDate } from '@evidence/domain';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { toCsv } from './csv-export.ts';
import type { TrainingService } from './service.ts';

const TIMING_LABEL = { overdue: 'již po termínu', 'on-time': 'včas', late: 'po termínu platnosti' };
const STATUS_LABEL = { ok: 'platné', expiring: 'brzy vyprší', expired: 'prošlé', missing: 'chybí' };

const isoDate = z
  .string()
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && parseDate(value).ok, {
    message: 'expected a valid date YYYY-MM-DD',
  });
const optionalText = z
  .string()
  .trim()
  .max(100)
  .transform((v) => v || undefined)
  .optional();

const snapshotQuery = z.object({
  asOf: isoDate.optional(),
  warningDays: z.coerce.number().int().min(1).max(365).optional(),
});
const employeeFilter = snapshotQuery.extend({
  unit: optionalText,
  managerId: optionalText,
  state: z.enum(['active', 'starting', 'leaving', 'parental_leave', 'terminated']).optional(),
  q: optionalText,
});
const actionFilter = employeeFilter.extend({
  code: optionalText,
  status: z.enum(['ok', 'expiring', 'expired', 'missing']).optional(),
});

export interface RouteOptions {
  service: TrainingService;
  /** Today's date in the institution's time zone; injectable for tests. */
  today: () => string;
}

export function registerRoutes(app: FastifyInstance, { service, today }: RouteOptions): void {
  const parse = <T extends z.ZodType>(schema: T, input: unknown, reply: FastifyReply) => {
    const result = schema.safeParse(input);
    if (!result.success) {
      void reply
        .code(400)
        .send({ error: 'Bad Request', issues: z.flattenError(result.error).fieldErrors });
      return null;
    }
    return result.data as z.infer<T>;
  };
  const snapshot = (q: z.infer<typeof snapshotQuery>) => ({
    referenceDate: q.asOf ?? today(),
    warningDays: q.warningDays ?? DEFAULT_WARNING_DAYS,
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/meta', async () => service.meta(today(), DEFAULT_WARNING_DAYS));

  app.get('/api/overview', async (request, reply) => {
    const q = parse(employeeFilter, request.query, reply);
    return q && service.overview(snapshot(q), q);
  });

  app.get('/api/actions', async (request, reply) => {
    const q = parse(actionFilter, request.query, reply);
    return q && service.actions(snapshot(q), q);
  });

  app.get('/api/employees', async (request, reply) => {
    const q = parse(employeeFilter, request.query, reply);
    return q && service.employees(snapshot(q), q);
  });

  app.get('/api/employees/:id', async (request, reply) => {
    const params = parse(z.object({ id: z.string().regex(/^E\d{4}$/) }), request.params, reply);
    const q = params && parse(snapshotQuery, request.query, reply);
    if (!params || !q) return;
    const detail = service.employee(params.id, snapshot(q));
    return detail ?? reply.code(404).send({ error: 'Not Found' });
  });

  app.get('/api/plan', async (request, reply) => {
    const q = parse(snapshotQuery, request.query, reply);
    return q && service.plan(snapshot(q));
  });

  app.get('/api/plan.csv', async (request, reply) => {
    const q = parse(snapshotQuery, request.query, reply);
    if (!q) return;
    const params = snapshot(q);
    const plan = service.plan(params);
    const rows = plan.sessions.flatMap((s) =>
      s.assigned.map((p) => [
        s.id,
        s.code,
        s.name,
        formatCz(s.date),
        s.time,
        s.place,
        p.id,
        p.name,
        p.unit,
        STATUS_LABEL[p.status],
        formatCz(p.deadline),
        TIMING_LABEL[p.timing],
        s.priceCzk,
      ])
    );
    const csv = toCsv(
      [
        'Termín',
        'Kód',
        'Školení',
        'Datum',
        'Čas',
        'Místo',
        'ID zaměstnance',
        'Zaměstnanec',
        'Útvar',
        'Stav školení',
        'Nutné do',
        'Vůči platnosti',
        'Cena (Kč)',
      ],
      rows
    );
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="plan-prihlasek-${params.referenceDate}.csv"`
      )
      .send(csv);
  });

  app.get('/api/data-quality', async () => service.dataQuality());
}
