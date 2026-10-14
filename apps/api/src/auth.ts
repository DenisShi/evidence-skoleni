import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export interface BasicAuthCredentials {
  user: string;
  password: string;
}

/** Paths reachable without credentials (platform health checks). */
const PUBLIC_PATHS = new Set(['/api/health']);

/**
 * Protects the whole site, including the SPA, with HTTP Basic auth. Served over HTTPS by the
 * hosting platform. Credentials are compared in constant time.
 */
export function registerBasicAuth(app: FastifyInstance, credentials: BasicAuthCredentials): void {
  const expected = digest(`${credentials.user}:${credentials.password}`);

  app.addHook('onRequest', async (request, reply) => {
    if (PUBLIC_PATHS.has(request.url.split('?')[0] ?? '')) return;

    const header = request.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');
    const supplied =
      scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
    if (!timingSafeEqual(digest(supplied), expected)) {
      return reply
        .code(401)
        .header('WWW-Authenticate', 'Basic realm="Evidence skoleni", charset="UTF-8"')
        .send({ error: 'Unauthorized' });
    }
  });
}

/** Hashing first gives equal-length buffers, which `timingSafeEqual` requires. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
