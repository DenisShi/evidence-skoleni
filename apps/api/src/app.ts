import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { ImportResult } from '@evidence/domain';
import Fastify, { type FastifyInstance } from 'fastify';
import { type BasicAuthCredentials, registerBasicAuth } from './auth.ts';
import { registerRoutes } from './routes.ts';
import { TrainingService } from './service.ts';

export interface AppOptions {
  data: ImportResult;
  auth?: BasicAuthCredentials | undefined;
  webDistDir?: string | undefined;
  logLevel?: string;
  logStream?: { write(line: string): void };
  today?: () => string;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: {
      level: options.logLevel ?? 'silent',
      ...(options.logStream && { stream: options.logStream }),
      serializers: {
        // The query string can carry a name search (?q=), so only the path is logged.
        // Headers (incl. credentials) and the client address are left out as well.
        req: (request) => ({ method: request.method, url: request.url.split('?')[0] }),
      },
    },
  });

  if (options.auth) registerBasicAuth(app, options.auth);

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    // Personal data must not stay in shared caches.
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  registerRoutes(app, {
    service: new TrainingService(options.data.dataset, options.data.report),
    today: options.today ?? todayInPrague,
  });

  if (options.webDistDir) serveSpa(app, resolve(options.webDistDir));

  return app;
}

function serveSpa(app: FastifyInstance, root: string): void {
  if (!existsSync(resolve(root, 'index.html'))) {
    throw new Error(`WEB_DIST_DIR ${root} does not contain index.html`);
  }
  void app.register(fastifyStatic, { root, wildcard: false });
  // Client-side routes (/zamestnanci/E0042) fall back to the SPA; unknown API paths stay 404.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });
}

/** The institution works in Prague time; a UTC server would switch dates an hour or two late. */
export function todayInPrague(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
}
