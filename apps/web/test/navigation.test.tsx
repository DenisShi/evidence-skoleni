import type { Meta, OverviewResponse } from '@evidence/api/dto';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../src/components/AppLayout.tsx';
import { Prehled } from '../src/pages/Prehled.tsx';
import { ZamestnanecDetail } from '../src/pages/ZamestnanecDetail.tsx';
import { renderPage } from './render.tsx';

const meta: Meta = {
  exportDate: '2026-10-01',
  today: '2026-10-14',
  defaultWarningDays: 90,
  units: [],
  trainingTypes: [],
  managers: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('menu', () => {
  const selectedItems = () =>
    [...document.querySelectorAll('.ant-menu-item-selected')].map((el) => el.textContent);

  it('highlights the page of the current path, including its detail pages', async () => {
    renderPage('*', <AppLayout />, '/zamestnanci/E0003', { '/api/meta': meta });
    expect(await screen.findByText('Zaměstnanci')).toBeInTheDocument();
    expect(selectedItems()).toEqual(['Zaměstnanci']);
  });

  it('highlights nothing on an unknown path', async () => {
    renderPage('*', <AppLayout />, '/neexistuje', { '/api/meta': meta });
    expect(await screen.findByText('Přehled')).toBeInTheDocument();
    expect(selectedItems()).toEqual([]);
  });
});

describe('Zaměstnanec - back link', () => {
  const back = () => screen.findByRole('link', { name: /^Zpět/ });

  it('returns to the list it was opened from, with its search and the current reference date', async () => {
    renderPage(
      '/zamestnanci/:id',
      <ZamestnanecDetail />,
      {
        pathname: '/zamestnanci/E0003',
        search: '?asOf=2026-11-01',
        state: { from: '/zamestnanci?asOf=2026-10-14&q=novak&state=leaving' },
      },
      {}
    );
    const link = await back();
    expect(link).toHaveTextContent('Zpět');
    expect(link).toHaveAttribute('href', '/zamestnanci?asOf=2026-11-01&q=novak&state=leaving');
  });

  it('falls back to the employee list when opened directly', async () => {
    renderPage('/zamestnanci/:id', <ZamestnanecDetail />, '/zamestnanci/E0003?asOf=2026-11-01', {});
    const link = await back();
    expect(link).toHaveTextContent('Zpět na zaměstnance');
    expect(link).toHaveAttribute('href', '/zamestnanci?asOf=2026-11-01');
  });

  it('ignores a "from" outside the app', async () => {
    renderPage(
      '/zamestnanci/:id',
      <ZamestnanecDetail />,
      { pathname: '/zamestnanci/E0003', state: { from: '//evil.example/' } },
      {}
    );
    expect(await back()).toHaveAttribute('href', '/zamestnanci');
  });

  it('is there also when the employee does not exist', async () => {
    renderPage('/zamestnanci/:id', <ZamestnanecDetail />, '/zamestnanci/E9999', {});
    expect(await screen.findByText('Záznam neexistuje')).toBeInTheDocument();
    expect(await back()).toHaveAttribute('href', '/zamestnanci');
  });
});

describe('Přehled - "K řešení"', () => {
  const counts = { total: 20, ok: 5, expiring: 6, expired: 4, missing: 5, needsAction: 13 };
  const overview: OverviewResponse = {
    referenceDate: '2026-10-14',
    warningDays: 90,
    employeesByState: { active: 4, starting: 1, leaving: 1, parental_leave: 0, terminated: 0 },
    totals: counts,
    byTraining: [],
    byUnit: [],
    matrix: [],
  };

  it('breaks the number down into all its parts and names what needs no action', async () => {
    renderPage('/', <Prehled />, '/', { '/api/overview': overview, '/api/meta': meta });
    expect(
      await screen.findByText(
        '4 prošlá, 5 chybějících, 6 brzy vyprší; z toho 2 neřešit (odchod před termínem)'
      )
    ).toBeInTheDocument();
  });
});
