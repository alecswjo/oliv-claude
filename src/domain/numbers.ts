/**
 * Locale-tolerant numeric input parsing for editable nutrition fields.
 * Users type "1,200" (thousands), "12,5" (decimal comma), or "1.200,5";
 * naive `Number(value.replace(',', '.'))` turned "1,200" into 1.2 — a
 * 1-kcal meal. Heuristic: a single comma followed by exactly three digits
 * (or multiple commas) is thousands grouping; otherwise it's a decimal.
 */
export function parseNumericInput(value: string): number {
  const s = value.trim().replace(/\s+/g, '');
  if (!s) return 0;
  let normalized = s;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastDot > lastComma
        ? s.replace(/,/g, '') // 1,234.5 — comma groups
        : s.replace(/\./g, '').replace(',', '.'); // 1.234,5 — dot groups
  } else if (lastComma >= 0) {
    const digitsAfter = s.length - lastComma - 1;
    const commaCount = (s.match(/,/g) ?? []).length;
    normalized =
      commaCount > 1 || digitsAfter === 3
        ? s.replace(/,/g, '') // 1,200 → 1200
        : s.replace(',', '.'); // 12,5 → 12.5
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
