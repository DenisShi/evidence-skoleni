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

    // The scheme name is case-insensitive (RFC 7235); anything else malformed fails the comparison.
    const match = /^basic\s+(\S+)\s*$/i.exec(request.headers.authorization ?? '');
    const supplied = match ? Buffer.from(match[1]!, 'base64').toString('utf8') : '';
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
