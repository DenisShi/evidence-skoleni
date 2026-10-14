import Papa from 'papaparse';

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'windows-1250';
}

const BOM = String.fromCharCode(0xfeff);

/**
 * The exports come from different systems: some are UTF-8 (with or without BOM), the training
 * records are Windows-1250. Valid UTF-8 is tried first because cp1250 accepts any byte sequence.
 */
export function decodeText(input: Uint8Array | string): DecodedText {
  if (typeof input === 'string') {
    return { text: input.startsWith(BOM) ? input.slice(1) : input, encoding: 'utf-8' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(input), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1250').decode(input), encoding: 'windows-1250' };
  }
}

export interface CsvTable {
  header: string[];
  /** Data rows keyed by header name; missing cells are empty strings. */
  rows: Record<string, string>[];
}

/** Delimiter differs between files (`,` vs `;`); decide from the header line. */
export function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

export function parseCsv(text: string): CsvTable {
  const result = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    skipEmptyLines: 'greedy',
  });
  const [header = [], ...data] = result.data;
  const names = header.map((h) => h.trim());
  const rows = data.map((cells) =>
    Object.fromEntries(names.map((name, i) => [name, cells[i] ?? '']))
  );
  return { header: names, rows };
}
