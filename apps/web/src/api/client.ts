export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export type QueryParams = Record<string, string | number | undefined>;

export function apiUrl(path: string, params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Same-origin requests: the browser sends the Basic auth credentials automatically. */
export async function getJson<T>(path: string, params?: QueryParams): Promise<T> {
  const response = await fetch(apiUrl(path, params), { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Požadavek selhal (${response.status} ${response.statusText})`
    );
  }
  return response.json() as Promise<T>;
}
