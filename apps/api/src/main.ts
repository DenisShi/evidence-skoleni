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

// The platform stops containers with SIGTERM; as PID 1, Node would otherwise ignore it and get killed
// after the grace period with requests still in flight.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.fatal(err);
  process.exit(1);
}
