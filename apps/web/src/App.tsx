import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Result } from 'antd';
import csCZ from 'antd/locale/cs_CZ';
import dayjs from 'dayjs';
import 'dayjs/locale/cs';
import { type ComponentType, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from './api/client.ts';
import { AppLayout } from './components/AppLayout.tsx';
import { Loading } from './components/common.tsx';

dayjs.locale('cs');

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    // Shown while the first page chunk loads.
    hydrateFallbackElement: <Loading minHeight="100vh" />,
    errorElement: (
      <Result status="error" title="Něco se pokazilo" subTitle="Zkuste stránku načíst znovu." />
    ),
    children: [
      // Each page is a separate chunk, loaded on first visit.
      { index: true, lazy: () => import('./pages/Prehled.tsx').then((m) => page(m.Prehled)) },
      {
        path: 'co-resit',
        lazy: () => import('./pages/CoResit.tsx').then((m) => page(m.CoResit)),
      },
      {
        path: 'zamestnanci',
        lazy: () => import('./pages/Zamestnanci.tsx').then((m) => page(m.Zamestnanci)),
      },
      {
        path: 'zamestnanci/:id',
        lazy: () => import('./pages/ZamestnanecDetail.tsx').then((m) => page(m.ZamestnanecDetail)),
      },
      {
        path: 'plan',
        lazy: () => import('./pages/PlanPrihlasek.tsx').then((m) => page(m.PlanPrihlasek)),
      },
      {
        path: 'kvalita-dat',
        lazy: () => import('./pages/KvalitaDat.tsx').then((m) => page(m.KvalitaDat)),
      },
      { path: '*', element: <Result status="404" title="Stránka neexistuje" /> },
    ],
  },
];

function page(Component: ComponentType) {
  return { Component };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx (unknown employee, invalid parameter) will not change on retry; a 5xx or network error may.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});
const router = createBrowserRouter(routes);

/**
 * The page chunks are small, so all of them are fetched once the first page is up: a later switch
 * to another page then does not wait for its chunk.
 */
function preloadPages() {
  for (const route of routes[0]!.children) void route.lazy?.().catch(() => undefined);
}

export function App() {
  useEffect(() => {
    const timer = setTimeout(preloadPages, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ConfigProvider locale={csCZ}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ConfigProvider>
  );
}
