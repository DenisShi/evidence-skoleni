import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { todayInPrague } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { escapeCell, toCsv } from '../src/csv-export.ts';
import { loadData } from '../src/load-data.ts';
import { testApp } from './helpers.ts';

const credentials = { user: 'hr', password: 'correct-horse-battery' };
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

const webDir = mkdtempSync(join(tmpdir(), 'evidence-web-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>SPA</title>');
mkdirSync(join(webDir, 'assets'));
writeFileSync(join(webDir, 'assets', 'index-abc123.js'), 'console.log(1);');
afterAll(() => rmSync(webDir, { recursive: true, force: true }));

describe('basic auth', () => {
  const app = testApp({ auth: credentials, webDistDir: webDir });

  it('keeps the health check public', async () => {
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
  });

  it('challenges requests without credentials, for the API and the SPA', async () => {
    for (const url of ['/api/overview', '/', '/zamestnanci/E0003']) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Basic');
    }
  });

  it('rejects wrong credentials', async () => {
    const res = await app.inject({
      url: '/api/overview',
      headers: { authorization: basic('hr', 'wrong-password-123') },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts correct credentials', async () => {
    const res = await app.inject({
      url: '/api/overview',
      headers: { authorization: basic(credentials.user, credentials.password) },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts the scheme name in any case', async () => {
    const header = basic(credentials.user, credentials.password).replace('Basic', 'basic');
    const res = await app.inject({ url: '/api/overview', headers: { authorization: header } });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ['another scheme', `Bearer ${Buffer.from('hr:correct-horse-battery').toString('base64')}`],
    ['no credentials after the scheme', 'Basic '],
    [
      'credentials without a colon',
      `Basic ${Buffer.from('hrcorrect-horse-battery').toString('base64')}`,
    ],
    ['the right password for another user', basic('admin', credentials.password)],
    ['the password with a suffix', basic(credentials.user, `${credentials.password}x`)],
  ])('rejects %s', async (_, authorization) => {
    const res = await app.inject({ url: '/api/overview', headers: { authorization } });
    expect(res.statusCode).toBe(401);
  });

  it('protects the CSV export, the data quality report and employee detail', async () => {
    for (const url of ['/api/plan.csv', '/api/data-quality', '/api/employees/E0003']) {
      expect((await app.inject({ url })).statusCode, url).toBe(401);
    }
  });

  it('accepts a password that contains a colon', async () => {
    const withColon = testApp({ auth: { user: 'hr', password: 'pass:word:12345' } });
    const res = await withColon.inject({
      url: '/api/overview',
      headers: { authorization: basic('hr', 'pass:word:12345') },
    });
    expect(res.statusCode).toBe(200);
  });

  it('does not log credentials of rejected requests', async () => {
    const lines: string[] = [];
    const logged = testApp({
      auth: credentials,
      logLevel: 'info',
      logStream: { write: (line) => lines.push(line) },
    });
    const authorization = basic('hr', 'guessed-password-1');
    await logged.inject({ url: '/api/overview', headers: { authorization } });
    const log = lines.join('');
    expect(log).toContain('401');
    expect(log).not.toContain(authorization.slice('Basic '.length));
    expect(log).not.toContain('guessed-password-1');
  });
});

describe('SPA hosting', () => {
  const app = testApp({ webDistDir: webDir });

  it('serves index.html for client-side routes', async () => {
    const res = await app.inject({ url: '/zamestnanci/E0003' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>SPA</title>');
  });

  it('does not fall back to the SPA for unknown API paths', async () => {
    expect((await app.inject({ url: '/api/nope' })).statusCode).toBe(404);
  });

  it('answers 404 for missing files instead of serving index.html as a script', async () => {
    // e.g. a chunk of the previous deployment requested by a tab that is still open
    for (const url of ['/assets/PlanPrihlasek-old.js', '/favicon.ico']) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).toBe(404);
      expect(res.body, url).not.toContain('<title>SPA</title>');
    }
  });

  it('caches hashed assets for good and revalidates index.html', async () => {
    const asset = await app.inject({ url: '/assets/index-abc123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    for (const url of ['/', '/index.html', '/plan']) {
      expect((await app.inject({ url })).headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('sends a content security policy with the page', async () => {
    const res = await app.inject({ url: '/' });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
  });

  it('refuses to start without a built index.html', () => {
    const empty = mkdtempSync(join(tmpdir(), 'evidence-empty-'));
    try {
      expect(() => testApp({ webDistDir: empty })).toThrow(/does not contain index.html/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('errors', () => {
  it('answers unexpected errors without internal details and logs them', async () => {
    const lines: string[] = [];
    const app = testApp({ logLevel: 'error', logStream: { write: (line) => lines.push(line) } });
    app.get('/api/boom', async () => {
      throw new Error('ENOENT /etc/secrets/zamestnanci.csv');
    });
    const res = await app.inject({ url: '/api/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal Server Error' });
    expect(lines.join('')).toContain('ENOENT');
  });

  it('does not echo the requested URL in a 404', async () => {
    const res = await testApp().inject({ url: '/api/nope?q=Novak' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('Novak');
  });
});

describe('data loading', () => {
  it('fails fast and names the missing files', () => {
    const empty = mkdtempSync(join(tmpdir(), 'evidence-data-'));
    try {
      expect(() => loadData(empty, '2026-10-01')).toThrow(
        /Missing data files.*zamestnanci\.csv.*terminy_skoleni\.csv/
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('todayInPrague', () => {
  it.each([
    ['2026-10-14T21:30:00Z', '2026-10-14'], // 23:30 summer time
    ['2026-10-14T22:30:00Z', '2026-10-15'], // already the next day in Prague, not yet in UTC
    ['2026-12-31T23:30:00Z', '2027-01-01'], // winter time, UTC+1
  ])('%s → %s', (instant, expected) => {
    expect(todayInPrague(new Date(instant))).toBe(expected);
  });
});

describe('config', () => {
  it('requires basic auth in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/Basic auth is mandatory/);
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        BASIC_AUTH_USER: 'hr',
        BASIC_AUTH_PASSWORD: 'long-enough-pw',
      })
    ).not.toThrow();
  });

  it('rejects short passwords and a user without password', () => {
    expect(() => loadConfig({ BASIC_AUTH_USER: 'hr', BASIC_AUTH_PASSWORD: 'short' })).toThrow();
    expect(() => loadConfig({ BASIC_AUTH_USER: 'hr' })).toThrow(/set together/);
  });
});

describe('CSV export escaping', () => {
  it.each([
    ['=HYPERLINK("https://example.com";"klik")', `"'=HYPERLINK(""https://example.com"";""klik"")"`],
    ['@SUM(1+1)', "'@SUM(1+1)"],
    ['+1+1', "'+1+1"],
    ['-2+3', "'-2+3"],
    ['Novák; Karel', '"Novák; Karel"'],
    ['řádek 1\nřádek 2', '"řádek 1\nřádek 2"'],
    ['Laboratoře', 'Laboratoře'],
  ])('%s → %s', (value, expected) => {
    expect(escapeCell(value)).toBe(expected);
  });

  it('keeps numbers and empty cells as they are', () => {
    expect(escapeCell(-600)).toBe('-600');
    expect(escapeCell(null)).toBe('');
  });

  it('joins rows with CRLF and starts with a BOM', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe(`${String.fromCharCode(0xfeff)}a;b\r\n1;x\r\n`);
  });
});

describe('request logging', () => {
  it('logs the path without the query string, which can carry a name search', async () => {
    const lines: string[] = [];
    const app = testApp({ logLevel: 'info', logStream: { write: (line) => lines.push(line) } });
    await app.inject({ url: '/api/employees?q=Novak' });
    const log = lines.join('');
    expect(log).toContain('/api/employees');
    expect(log).not.toContain('Novak');
  });
});
