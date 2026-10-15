import { existsSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import { resolve, sep } from 'node:path';
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

/**
 * The SPA loads only its own bundle. antd injects its CSS-in-JS as <style> elements, hence
 * 'unsafe-inline' for styles; scripts stay limited to same-origin files.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  // Production runs behind HTTPS only (the platform terminates TLS); browsers ignore it over HTTP.
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Robots-Tag': 'noindex, nofollow',
};

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
    reply.headers(SECURITY_HEADERS);
    // Personal data must not stay in shared caches.
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  // Fastify would answer with the error message, which can describe internals. The client gets
  // only the status; the details go to the log.
  app.setErrorHandler((error, request, reply) => {
    const code = (error as { statusCode?: unknown }).statusCode;
    const status = typeof code === 'number' && code >= 400 && code < 500 ? code : 500;
    if (status === 500) request.log.error({ err: error }, 'request failed');
    return reply.code(status).send({ error: STATUS_CODES[status] });
  });

  registerRoutes(app, {
    service: new TrainingService(options.data.dataset, options.data.report),
    today: options.today ?? todayInPrague,
  });

  const spa = options.webDistDir !== undefined;
  if (spa) serveSpa(app, resolve(options.webDistDir!));

  // Client-side routes (/zamestnanci/E0042) fall back to the SPA. Unknown API paths and missing
  // files stay 404: a chunk of an older deployment must not come back as index.html.
  // Fastify's own 404 body would echo the requested URL, including the query.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (spa && request.method === 'GET' && !path.startsWith('/api/') && !/\.\w+$/.test(path)) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });

  return app;
}

function serveSpa(app: FastifyInstance, root: string): void {
  if (!existsSync(resolve(root, 'index.html'))) {
    throw new Error(`WEB_DIST_DIR ${root} does not contain index.html`);
  }
  const assetsDir = resolve(root, 'assets') + sep;
  void app.register(fastifyStatic, {
    root,
    wildcard: false,
    cacheControl: false,
    // Vite puts a content hash into asset file names, so they can be cached for good; index.html
    // must be revalidated to pick up a new deployment.
    setHeaders: (reply, path) => {
      reply.header(
        'Cache-Control',
        path.startsWith(assetsDir) ? 'private, max-age=31536000, immutable' : 'no-cache'
      );
    },
  });
}

/** The institution works in Prague time; a UTC server would switch dates an hour or two late. */
export function todayInPrague(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(now);
}
