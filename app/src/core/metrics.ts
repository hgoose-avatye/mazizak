/** Rolling sample window with percentile queries. */
export class Rolling {
  private buf: number[] = [];
  constructor(private readonly size = 240) {}

  push(v: number): void {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
  }

  get count(): number {
    return this.buf.length;
  }

  clear(): void {
    this.buf.length = 0;
  }

  values(): number[] {
    return this.buf.slice();
  }

  percentile(p: number): number {
    return percentile(this.buf, p);
  }

  max(): number {
    return this.buf.length ? Math.max(...this.buf) : NaN;
  }

  mean(): number {
    if (!this.buf.length) return NaN;
    return this.buf.reduce((a, b) => a + b, 0) / this.buf.length;
  }

  fractionAbove(threshold: number): number {
    if (!this.buf.length) return NaN;
    return this.buf.filter((v) => v > threshold).length / this.buf.length;
  }
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

export interface Summary {
  n: number;
  p50: number;
  p95: number;
  max: number;
}

export function summarize(values: number[]): Summary {
  return {
    n: values.length,
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    max: round(values.length ? Math.max(...values) : NaN),
  };
}

export function round(v: number, digits = 2): number {
  if (!Number.isFinite(v)) return v;
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
