import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importDataset, type ImportResult, type IsoDate } from '@evidence/domain';

const FILES = {
  employees: 'zamestnanci.csv',
  records: 'absolvovana_skoleni.csv',
  catalog: 'katalog_skoleni.csv',
  sessions: 'terminy_skoleni.csv',
} as const;

/**
 * Reads the four exports once at startup. Missing files, or files without a single usable record
 * (e.g. an empty secret file on the platform), are a deployment error, so fail fast.
 */
export function loadData(dataDir: string, exportDate: IsoDate): ImportResult {
  const dir = resolve(dataDir);
  const missing = Object.values(FILES).filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0) {
    throw new Error(`Missing data files in ${dir}: ${missing.join(', ')}`);
  }
  const read = (file: string) => readFileSync(join(dir, file));
  const result = importDataset({
    employees: read(FILES.employees),
    records: read(FILES.records),
    catalog: read(FILES.catalog),
    sessions: read(FILES.sessions),
    exportDate,
  });
  const empty = result.report.files.filter((f) => f.imported === 0).map((f) => `${f.file}.csv`);
  if (empty.length > 0) {
    throw new Error(`Data files in ${dir} contain no usable records: ${empty.join(', ')}`);
  }
  return result;
}
