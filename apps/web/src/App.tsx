import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Result } from 'antd';
import csCZ from 'antd/locale/cs_CZ';
import dayjs from 'dayjs';
import 'dayjs/locale/cs';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './components/AppLayout.tsx';
import { CoResit } from './pages/CoResit.tsx';
import { KvalitaDat } from './pages/KvalitaDat.tsx';
import { PlanPrihlasek } from './pages/PlanPrihlasek.tsx';
import { Prehled } from './pages/Prehled.tsx';
import { ZamestnanecDetail } from './pages/ZamestnanecDetail.tsx';
import { Zamestnanci } from './pages/Zamestnanci.tsx';

dayjs.locale('cs');

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: (
      <Result status="error" title="Něco se pokazilo" subTitle="Zkuste stránku načíst znovu." />
    ),
    children: [
      { index: true, element: <Prehled /> },
      { path: 'co-resit', element: <CoResit /> },
      { path: 'zamestnanci', element: <Zamestnanci /> },
      { path: 'zamestnanci/:id', element: <ZamestnanecDetail /> },
      { path: 'plan', element: <PlanPrihlasek /> },
      { path: 'kvalita-dat', element: <KvalitaDat /> },
      { path: '*', element: <Result status="404" title="Stránka neexistuje" /> },
    ],
  },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const router = createBrowserRouter(routes);

export function App() {
  return (
    <ConfigProvider locale={csCZ}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ConfigProvider>
  );
}
