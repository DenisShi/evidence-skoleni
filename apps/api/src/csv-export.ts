import { looksLikeFormula } from '@evidence/domain';

const BOM = String.fromCharCode(0xfeff);

export type Cell = string | number | null;

/**
 * Text cells starting with `=`, `+`, `-`, `@` would be executed as formulas by Excel
 * (the source data already contain `=HYPERLINK(...)`), so they are prefixed with `'`.
 */
export function escapeCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = looksLikeFormula(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Semicolon-separated UTF-8 with BOM: opens correctly in Czech Excel by double-click. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
