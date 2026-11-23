const destinations = {
  '/stock-dashboard': 'Stock',
  '/stock-test': 'Stock Operations',
  '/buying': 'Buying',
  '/outstanding-issues': 'Outstanding Issues',
  '/job-cards': 'Job Cards',
  '/town-trips': 'Town Trips',
  '/stock-v2-purchase-orders': 'Purchase Orders',
  '/stock-v2-approvals': 'Approvals',
  '/stock-v2-spray-planning': 'Spray Planning',
  '/stock-v2-corrections': 'D-Note Corrections',
  '/stock-v2-supplier-returns': 'Supplier Returns',
  '/stock-v2-stocktake': 'Stock Take',
} as const;

type StockPath = keyof typeof destinations;
type RouteParams = Record<string, string | undefined>;

export function stockLocation(path: StockPath, params: RouteParams = {}) {
  // Expo decodes route parameters on refresh. Keep nested return locations structured
  // so an inner query string cannot become part of the outer screen's parameters.
  return JSON.stringify({path, params});
}

function destination(pathname: StockPath, params: Record<string, string> = {}) {
  const label = pathname === '/job-cards' && params.card ? 'Job Card'
    : pathname === '/town-trips' && params.trip ? 'Town Trip'
    : pathname === '/stock-test' && ['Direct Issue', 'Stock Balances'].includes(params.operation) ? params.operation
    : destinations[pathname];
  return {label: '← ' + label, href: {pathname, params}};
}

const contextKeys = new Set(['from','view','card','trip','job','owner','status','review','sheetId','operation','fromSpray','returnTo']);

function readLocation(value?: string) {
  if (!value) return;
  if (Object.prototype.hasOwnProperty.call(destinations, value)) return destination(value as StockPath);
  try {
    const {path, params} = JSON.parse(value);
    if (!Object.prototype.hasOwnProperty.call(destinations, path) || !params || typeof params !== 'object') return;
    const context: Record<string,string> = {};
    for (const [key, entry] of Object.entries(params)) {
      if (contextKeys.has(key) && typeof entry === 'string') context[key] = entry;
    }
    return destination(path as StockPath, context);
  } catch { return; }
}

export function stockParent(params: RouteParams, moduleMenu = false) {
  const saved = readLocation(params.returnTo);
  if (saved) return saved;
  switch (params.from) {
    case 'stock-dashboard': return destination('/stock-dashboard');
    case 'stock': return destination('/stock-test');
    case 'buying': return destination('/buying');
    case 'outstanding-issues': return destination('/outstanding-issues');
    case 'direct-issue': return destination('/stock-test', {operation: 'Direct Issue'});
    case 'job-card': return destination('/job-cards', {view: 'outstanding', card: params.job || ''});
    case 'town-trip': return destination('/town-trips', {view: 'history', trip: params.trip || ''});
    case 'approval': return destination('/stock-v2-approvals');
    default: return destination(params.fromSpray ? '/stock-v2-spray-planning' : moduleMenu ? '/stock-dashboard' : '/stock-test');
  }
}
