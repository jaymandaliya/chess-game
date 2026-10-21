export function rupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  const value = paise / 100;
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// "399" or "399.50" → 39900 / 39950, using string math so no floating-point rounding
export function rupeesToPaise(input: string): number | null {
  const m = /^\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

export function paiseToRupeesInput(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return p ? `${r}.${String(p).padStart(2, '0')}` : String(r);
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-IN');
}

export function dateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function date(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export function humanize(text?: string | null): string {
  if (!text) return '—';
  return text.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// <input type="date"> value → ISO bounds covering the whole IST day
export function dayStartIso(day: string): string | undefined {
  return day ? new Date(`${day}T00:00:00+05:30`).toISOString() : undefined;
}

export function dayEndIso(day: string): string | undefined {
  return day ? new Date(`${day}T23:59:59.999+05:30`).toISOString() : undefined;
}

// Every IST day (yyyy-mm-dd) or month (yyyy-mm) in the range, so charts show gaps as zero
export function periodsBetween(fromDay: string, toDay: string, groupBy: 'day' | 'month' = 'day'): string[] {
  const out: string[] = [];
  const d = new Date(`${fromDay}T00:00:00Z`);
  const end = new Date(`${toDay}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    const key = groupBy === 'month' ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
    if (out[out.length - 1] !== key) out.push(key);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function istDay(date: Date): string {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function fillSeries<T extends { period: string }>(series: T[], periods: string[], value: (p: T) => number) {
  const byPeriod = new Map(series.map((p) => [p.period, value(p)]));
  return periods.map((period) => ({ label: period, value: byPeriod.get(period) ?? 0 }));
}
