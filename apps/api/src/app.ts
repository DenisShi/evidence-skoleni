import Fastify, { type FastifyInstance } from 'fastify';

export interface AppOptions {
  logLevel?: string;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: { level: options.logLevel ?? 'silent' } });

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
