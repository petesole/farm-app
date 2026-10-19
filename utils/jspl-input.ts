/** Shared date and select helpers; framework-independent. */
export function parseJsplDateInput(text: string, year = new Date().getFullYear()): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]), month = Number(match[2]), fullYear = match[3] ? Number(match[3]) : year;
  if (fullYear < 1 || fullYear > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const test = new Date(0);
  test.setFullYear(fullYear, month - 1, day);
  if (test.getFullYear() !== fullYear || test.getMonth() !== month - 1 || test.getDate() !== day) return null;
  return `${String(fullYear).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function displayJsplDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
export type JsplOption = { id: string | number; label: string; active?: boolean };
export type JsplSelector = 'crop' | 'trace' | 'product';
export function filterJsplOptions(
  options: readonly JsplOption[], selector: JsplSelector, search: string,
  includeInactive = false,
): JsplOption[] {
  const prefix = search.trim().toLocaleLowerCase();
  return options.filter(o =>
    (includeInactive || selector === 'product' || o.active === true) &&
    o.label.toLocaleLowerCase().startsWith(prefix)
  );
}
