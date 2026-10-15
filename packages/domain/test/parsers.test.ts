import { describe, expect, it } from 'vitest';
import { decodeText, detectDelimiter, parseCsv } from '../src/csv.ts';
import { addMonths, daysBetween, formatCz, parseDate } from '../src/dates.ts';
import { buildUnitNormalizer, isKnownTypo, normalizeCode } from '../src/import/codes.ts';
import { parseCzk } from '../src/money.ts';
import {
  foldKey,
  looksLikeFormula,
  normalizeEmail,
  normalizePersonName,
  sameName,
} from '../src/text.ts';

describe('parseDate', () => {
  it.each([
    ['2019-01-06', '2019-01-06', 'iso'],
    ['6. 1. 2019', '2019-01-06', 'cz'],
    ['06.01.2019', '2019-01-06', 'cz'],
    ['43552', '2019-03-28', 'excel'],
    ['  2026-10-01 ', '2026-10-01', 'iso'],
  ])('%s -> %s (%s)', (raw, date, format) => {
    expect(parseDate(raw)).toEqual({ ok: true, date, format });
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(parseDate('31. 9. 2026')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDate('2026-02-30')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('distinguishes empty from unreadable', () => {
    expect(parseDate('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseDate('zítra')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('date arithmetic', () => {
  it('adds months and clamps to the end of month', () => {
    expect(addMonths('2019-01-06', 24)).toBe('2021-01-06');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('counts days across years', () => {
    expect(daysBetween('2026-10-01', '2026-12-31')).toBe(91);
    expect(daysBetween('2026-10-01', '2026-09-30')).toBe(-1);
  });

  it('formats dates the Czech way', () => {
    expect(formatCz('2026-10-01')).toBe('1. 10. 2026');
  });
});

describe('parseCzk', () => {
  it.each([
    ['1 500,00', 1500],
    ['380,- Kč', 380],
    ['0,- Kč', 0],
    ['2 100 Kč', 2100],
    [`2${String.fromCharCode(0xa0)}100 Kč`, 2100], // no-break space as thousands separator
    ['zdarma', 0],
    ['800', 800],
  ])('%s -> %d', (raw, value) => {
    expect(parseCzk(raw)).toEqual({ ok: true, value, negative: false });
  });

  it('keeps negative amounts but flags them', () => {
    expect(parseCzk('-600,00')).toEqual({ ok: true, value: -600, negative: true });
  });

  it('treats empty as unknown and garbage as unreadable', () => {
    expect(parseCzk('')).toEqual({ ok: true, value: null, negative: false });
    expect(parseCzk('dohodou')).toEqual({ ok: false });
  });
});

describe('text helpers', () => {
  it('folds diacritics, case and whitespace', () => {
    expect(foldKey('  SPRÁVA   budov ')).toBe('sprava budov');
  });

  it('normalizes person names', () => {
    expect(normalizePersonName('  LUCIE')).toBe('Lucie');
    expect(normalizePersonName('růžička')).toBe('Růžička');
    expect(normalizePersonName('Martina ')).toBe('Martina');
  });

  it('compares names regardless of order and diacritics', () => {
    expect(sameName('Kralova Hana', 'Hana Králová')).toBe(true);
    expect(sameName('Nový Jan', 'Tomáš Černý')).toBe(false);
  });

  it('repairs obvious e-mail typos and rejects incomplete addresses', () => {
    expect(normalizeEmail('jan.novy @test.example')).toEqual({
      ok: true,
      email: 'jan.novy@test.example',
      repaired: true,
    });
    expect(normalizeEmail('eva.mala@test,example')).toMatchObject({
      ok: true,
      email: 'eva.mala@test.example',
    });
    expect(normalizeEmail('petr.dvorak@test')).toEqual({ ok: false, email: null });
  });

  it('detects spreadsheet formulas', () => {
    for (const value of ['=HYPERLINK("x";"y")', '@SUM(1+1)', '+1+1', '-2+3']) {
      expect(looksLikeFormula(value)).toBe(true);
    }
    expect(looksLikeFormula('online verze')).toBe(false);
  });
});

describe('codes and units', () => {
  it('normalizes training code formatting', () => {
    for (const raw of [' BOZP-Z', 'bozp-z', 'BOZP_Z', 'BOZP Z', 'BOZP-Z ']) {
      expect(normalizeCode(raw)).toBe('BOZP-Z');
    }
  });

  it('applies only explicit typo corrections', () => {
    expect(normalizeCode('KYB3R')).toBe('KYBER');
    expect(isKnownTypo('KYB3R')).toBe(true);
    expect(normalizeCode('BOZP-X')).toBe('BOZP-X');
    expect(isKnownTypo(' kyber')).toBe(false);
  });

  it('maps unit spellings onto the majority spelling', () => {
    const normalize = buildUnitNormalizer([
      'Studijní oddělení',
      'Studijní oddělení',
      'Studijní',
      'Studijni oddeleni',
      'Správa budov',
      'SPRÁVA BUDOV',
      'Správa budov',
      '',
    ]);
    expect(normalize('Studijní')).toBe('Studijní oddělení');
    expect(normalize('Studijni oddeleni')).toBe('Studijní oddělení');
    expect(normalize('SPRÁVA BUDOV')).toBe('Správa budov');
    expect(normalize('  ')).toBeNull();
  });
});

describe('csv', () => {
  it('decodes Windows-1250 when the bytes are not valid UTF-8', () => {
    const cp1250 = new Uint8Array([0x9a, 0x6b, 0x6f, 0x6c, 0x65, 0x6e, 0xed]); // "školení"
    expect(decodeText(cp1250)).toEqual({ text: 'školení', encoding: 'windows-1250' });
  });

  it('strips the UTF-8 BOM', () => {
    const bytes = new TextEncoder().encode(`${String.fromCharCode(0xfeff)}id,jmeno`);
    expect(decodeText(bytes).text).toBe('id,jmeno');
  });

  it('detects the delimiter from the header', () => {
    expect(detectDelimiter('a;b;c\n1,5;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1;2;3')).toBe(',');
  });

  it('keeps quoted multi-line values with delimiters inside', () => {
    const table = parseCsv('id;poznamka\r\nZ1;"řádek 1\r\nřádek 2; s ""uvozovkami"""\r\nZ2;\r\n');
    expect(table.rows).toEqual([
      { id: 'Z1', poznamka: 'řádek 1\r\nřádek 2; s "uvozovkami"' },
      { id: 'Z2', poznamka: '' },
    ]);
  });
});
