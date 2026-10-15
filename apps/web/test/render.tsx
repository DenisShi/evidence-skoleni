import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, type InitialEntry, RouterProvider } from 'react-router';
import { vi } from 'vitest';

/** API responses by path prefix; a missing entry answers 404 like the real API. */
export type MockApi = Record<string, unknown>;

/**
 * Renders one page at `url` (a string, or a location with router state) with `fetch` answered
 * from `api`; returns the fetch mock.
 */
export function renderPage(path: string, element: ReactElement, url: InitialEntry, api: MockApi) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const requested = String(input).split('?')[0]!;
    const match = Object.keys(api)
      .filter((prefix) => requested === prefix || requested.startsWith(`${prefix}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (match === undefined) {
      return new Response('{"error":"Not Found"}', { status: 404, statusText: 'Not Found' });
    }
    return new Response(JSON.stringify(api[match]), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const router = createMemoryRouter([{ path, element }], { initialEntries: [url] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return fetchMock;
}
