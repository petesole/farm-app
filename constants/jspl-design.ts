/**
 * JSPL design tokens.
 * Expo / React Native / React Native Web compatible; no additional dependency.
 * All module UI styling should converge on these tokens incrementally.
 */
export const jsplColors = {
  primary: '#25633A',
  primaryDark: '#103D2B',
  secondary: '#85B66B',
  info: '#0284C7',
  warning: '#F59E0B',
  danger: '#DC2626',
  background: '#F8FAF9',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#1F2937',
  textSecondary: '#6B7280',
  successTint: '#ECF7EE',
  warningTint: '#FFF5E2',
  dangerTint: '#FDECEC',
} as const;

export const jsplSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const jsplRadii = { sm: 6, md: 10, lg: 14 } as const;
export const jsplSizes = { inputHeight: 44, buttonHeight: 44, tableRowMinHeight: 44, tableHeaderMinHeight: 42 } as const;
export const jsplType = {
  caption: 12,
  body: 14,
  cardTitle: 18,
  sectionTitle: 24,
  pageTitle: 32,
} as const;

export type JsplCellKind = 'text' | 'number' | 'date' | 'status' | 'actions';
export function jsplCellAlignment(kind: JsplCellKind): 'left' | 'right' | 'center' {
  if (kind === 'number') return 'right';
  if (kind === 'date' || kind === 'status' || kind === 'actions') return 'center';
  return 'left';
}
export function formatJsplNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
export function formatJsplDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
