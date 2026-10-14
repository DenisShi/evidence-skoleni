import type {
  ActionItemDto,
  DataQualityResponse,
  EmployeeDetail,
  EmployeeListItem,
  Meta,
  OverviewResponse,
  PlanResponse,
} from '@evidence/api/dto';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson, type QueryParams } from './client.ts';

// The data are a static export, so nothing changes while the page is open.
const STATIC = { staleTime: Infinity, placeholderData: keepPreviousData } as const;

export const useMeta = () =>
  useQuery({ queryKey: ['meta'], queryFn: () => getJson<Meta>('/api/meta'), staleTime: Infinity });

export const useOverview = (params: QueryParams) =>
  useQuery({
    queryKey: ['overview', params],
    queryFn: () => getJson<OverviewResponse>('/api/overview', params),
    ...STATIC,
  });

export const useActions = (params: QueryParams) =>
  useQuery({
    queryKey: ['actions', params],
    queryFn: () => getJson<ActionItemDto[]>('/api/actions', params),
    ...STATIC,
  });

export const useEmployees = (params: QueryParams) =>
  useQuery({
    queryKey: ['employees', params],
    queryFn: () => getJson<EmployeeListItem[]>('/api/employees', params),
    ...STATIC,
  });

export const useEmployee = (id: string, params: QueryParams) =>
  useQuery({
    queryKey: ['employee', id, params],
    queryFn: () => getJson<EmployeeDetail>(`/api/employees/${encodeURIComponent(id)}`, params),
    ...STATIC,
  });

export const usePlan = (params: QueryParams) =>
  useQuery({
    queryKey: ['plan', params],
    queryFn: () => getJson<PlanResponse>('/api/plan', params),
    ...STATIC,
  });

export const useDataQuality = () =>
  useQuery({
    queryKey: ['data-quality'],
    queryFn: () => getJson<DataQualityResponse>('/api/data-quality'),
    staleTime: Infinity,
  });
