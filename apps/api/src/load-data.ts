import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importDataset, type ImportResult, type IsoDate } from '@evidence/domain';

const FILES = {
  employees: 'zamestnanci.csv',
  records: 'absolvovana_skoleni.csv',
  catalog: 'katalog_skoleni.csv',
  sessions: 'terminy_skoleni.csv',
} as const;

/** Reads the four exports once at startup. Missing files are a deployment error, so fail fast. */
export function loadData(dataDir: string, exportDate: IsoDate): ImportResult {
  const dir = resolve(dataDir);
  const missing = Object.values(FILES).filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0) {
    throw new Error(`Missing data files in ${dir}: ${missing.join(', ')}`);
  }
  const read = (file: string) => readFileSync(join(dir, file));
  return importDataset({
    employees: read(FILES.employees),
    records: read(FILES.records),
    catalog: read(FILES.catalog),
    sessions: read(FILES.sessions),
    exportDate,
  });
}
