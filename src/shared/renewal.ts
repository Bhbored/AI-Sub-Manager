export function nextRenewal(anchor: string, cycle: 'monthly' | 'yearly', today: string) {
  if (!anchor || anchor >= today) return anchor;
  const [year, month, day] = anchor.split('-').map(Number);
  const [nowYear, nowMonth] = today.split('-').map(Number);
  const step = cycle === 'yearly' ? 12 : 1;
  let offset = Math.floor(((nowYear - year) * 12 + nowMonth - month) / step) * step;
  function at(months: number) {
    const first = new Date(Date.UTC(year, month - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    first.setUTCDate(Math.min(day, last.getUTCDate()));
    return first.toISOString().slice(0, 10);
  }
  return at(offset) >= today ? at(offset) : at(offset + step);
}
