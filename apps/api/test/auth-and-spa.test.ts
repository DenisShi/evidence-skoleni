import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { escapeCell, toCsv } from '../src/csv-export.ts';
import { testApp } from './helpers.ts';

const credentials = { user: 'hr', password: 'correct-horse-battery' };
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

const webDir = mkdtempSync(join(tmpdir(), 'evidence-web-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>SPA</title>');
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
