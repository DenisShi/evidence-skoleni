import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { loadData } from './load-data.ts';

const config = loadConfig();
const data = loadData(config.DATA_DIR, config.EXPORT_DATE);

const app = buildApp({
  data,
  auth:
    config.BASIC_AUTH_USER && config.BASIC_AUTH_PASSWORD
      ? { user: config.BASIC_AUTH_USER, password: config.BASIC_AUTH_PASSWORD }
      : undefined,
  webDistDir: config.WEB_DIST_DIR,
  logLevel: config.LOG_LEVEL,
});

// Summary only: counts, never row contents (they contain personal data).
app.log.info(
  {
    files: data.report.files,
    issues: data.report.issues.length,
    auth: Boolean(config.BASIC_AUTH_USER),
  },
  'data imported'
);
if (!config.BASIC_AUTH_USER)
  app.log.warn('Basic auth is disabled – use only for local development');

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.fatal(err);
  process.exit(1);
}
