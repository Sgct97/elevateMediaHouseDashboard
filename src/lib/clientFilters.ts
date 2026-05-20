export type ClientFilter = 'ddus';

function normalizeClient(value?: string | null): ClientFilter | null {
  const client = value?.trim().toLowerCase();
  return client === 'ddus' ? 'ddus' : null;
}

export function getClientFilterFromUrl(url: URL): ClientFilter | null {
  // Render client services enforce tenant filtering from server env, so users
  // cannot bypass it by editing browser-visible API query strings.
  return normalizeClient(process.env.DASHBOARD_CLIENT) || normalizeClient(url.searchParams.get('client'));
}

export function matchesClientFilter(filter: ClientFilter | null, values: Array<unknown>): boolean {
  if (!filter) return true;
  const haystack = values
    .filter(value => value !== null && value !== undefined)
    .map(value => String(value).toLowerCase())
    .join(' ');

  if (filter === 'ddus') return haystack.includes('ddus');
  return true;
}
