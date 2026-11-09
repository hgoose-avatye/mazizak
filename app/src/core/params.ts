const qs = new URLSearchParams(location.search);

/** Read a URL query parameter (used for tuning and A/B test switches). */
export function param(name: string, fallback: string): string {
  return qs.get(name) ?? fallback;
}

export function numParam(name: string, fallback: number): number {
  const v = qs.get(name);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
