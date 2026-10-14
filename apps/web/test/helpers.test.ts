import { describe, expect, it } from 'vitest';
import { apiUrl } from '../src/api/client.ts';
import { daysLeftLabel, formatCzk, formatDate, percent } from '../src/labels.ts';

describe('apiUrl', () => {
  it('drops empty parameters', () => {
    expect(apiUrl('/api/actions', { asOf: '2026-10-14', unit: undefined, q: '' })).toBe(
      '/api/actions?asOf=2026-10-14'
    );
    expect(apiUrl('/api/meta')).toBe('/api/meta');
  });

  it('encodes values', () => {
    expect(apiUrl('/api/actions', { unit: 'Správa budov' })).toBe(
      '/api/actions?unit=Spr%C3%A1va+budov'
    );
  });
});

describe('formatting', () => {
  it('formats dates the Czech way', () => {
    expect(formatDate('2026-10-01')).toBe('1. 10. 2026');
    expect(formatDate(null)).toBe('—');
  });

  it('describes days relative to the deadline', () => {
    expect(daysLeftLabel(-13)).toBe('13 dní po termínu');
    expect(daysLeftLabel(0)).toBe('dnes');
    expect(daysLeftLabel(48)).toBe('za 48 dní');
    expect(daysLeftLabel(1)).toBe('za 1 den');
    expect(daysLeftLabel(-3)).toBe('3 dny po termínu');
  });

  it('formats money and percentages', () => {
    expect(formatCzk(null)).toBe('—');
    expect(formatCzk(160900).replace(/\s/g, ' ')).toBe('160 900 Kč');
    expect(percent(662, 751)).toBe('88 %');
    expect(percent(0, 0)).toBe('—');
  });
});
