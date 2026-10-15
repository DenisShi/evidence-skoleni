import { useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router';

/**
 * All view state (reference date, warning window, filters) lives in the URL, so a view can be
 * bookmarked or sent to a colleague and survives a reload.
 */
export const SNAPSHOT_KEYS = ['asOf', 'warningDays'] as const;

export function useUrlState<K extends string>(keys: readonly K[]) {
  const [searchParams, setSearchParams] = useSearchParams();

  const values = Object.fromEntries(
    keys.map((k) => [k, searchParams.get(k) ?? undefined])
  ) as Record<K, string | undefined>;

  const set = useCallback(
    (patch: Partial<Record<K, string | number | null | undefined>>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return [values, set] as const;
}

/** Reference date and warning window shared by every page. */
export function useSnapshotParams() {
  const [values] = useUrlState(SNAPSHOT_KEYS);
  return values;
}

/** Keeps the shared snapshot parameters when navigating between pages. */
export function useLinkWithSnapshot() {
  const [searchParams] = useSearchParams();
  return useCallback(
    (path: string, extra: Record<string, string | undefined> = {}) => {
      const next = new URLSearchParams();
      for (const key of SNAPSHOT_KEYS) {
        const value = searchParams.get(key);
        if (value) next.set(key, value);
      }
      for (const [key, value] of Object.entries(extra)) if (value) next.set(key, value);
      const query = next.toString();
      return query ? `${path}?${query}` : path;
    },
    [searchParams]
  );
}

/** Router state of a link to a detail page: the list it was opened from, with its filters. */
export interface FromState {
  from?: string;
}

/**
 * Target of a "back" link on a detail page: the list it was opened from with its search and
 * filters, or `fallback` when opened directly. The reference date and warning window are taken
 * from the current URL, as they may have been changed on the detail page.
 */
export function useBackLink(fallback: string) {
  const link = useLinkWithSnapshot();
  const [searchParams] = useSearchParams();
  const from = (useLocation().state as FromState | null)?.from;
  // Only paths within the app; the router state is not trusted input.
  if (!from?.startsWith('/') || from.startsWith('//'))
    return { to: link(fallback), returns: false };
  const [path = '/', query = ''] = from.split('?');
  const next = new URLSearchParams(query);
  for (const key of SNAPSHOT_KEYS) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const search = next.toString();
  return { to: search ? `${path}?${search}` : path, returns: true };
}
