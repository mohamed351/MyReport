import { createColumn, defaultTableSpec, designTableHeight } from '../engine/table';
import type {
  Band,
  BandType,
  DataSourceDef,
  ElementKind,
  ElementStyle,
  FormatSpec,
  PageSettings,
  ReportDefinition,
  ReportElement,
} from './types';

let counter = 0;
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 794, height: 1123 },
  A5: { width: 559, height: 794 },
  Letter: { width: 816, height: 1056 },
  Legal: { width: 816, height: 1344 },
  'Receipt 80mm': { width: 302, height: 1123 },
  'Receipt 58mm': { width: 219, height: 1123 },
};

export const BAND_LABELS: Record<BandType, string> = {
  reportHeader: 'Report Header',
  pageHeader: 'Page Header',
  groupHeader: 'Group Header',
  detail: 'Detail',
  groupFooter: 'Group Footer',
  pageFooter: 'Page Footer',
  reportFooter: 'Report Footer',
};

export const FOOTER_TYPES: BandType[] = ['groupFooter', 'reportFooter', 'pageFooter'];

export const defaultStyle = (): ElementStyle => ({
  fontFamily: 'Segoe UI, Arial, sans-serif',
  fontSize: 12,
  bold: false,
  italic: false,
  underline: false,
  color: '#111111',
  background: 'transparent',
  align: 'left',
  vAlign: 'middle',
  borderWidth: 0,
  borderColor: '#333333',
  padding: 2,
});

export const defaultFormat = (): FormatSpec => ({ kind: 'none', decimals: 2, currency: 'USD' });

export function createElement(
  kind: ElementKind,
  x: number,
  y: number,
  overrides: Partial<Omit<ReportElement, 'style' | 'format'>> & {
    style?: Partial<ElementStyle>;
    format?: Partial<FormatSpec>;
  } = {},
): ReportElement {
  const size: Record<ElementKind, [number, number]> = {
    text: [120, 20],
    field: [120, 20],
    line: [200, 4],
    rect: [120, 60],
    image: [80, 80],
    table: [400, 46],
    chart: [360, 220],
    barcode: [200, 70],
    qrcode: [100, 100],
    crosstab: [480, 120],
  };
  const text: Record<ElementKind, string> = {
    text: 'Label',
    field: '{Field}',
    line: '',
    rect: '',
    image: '',
    table: '',
    chart: '',
    barcode: '{OrderID}',
    qrcode: 'https://example.com/{OrderID}',
    crosstab: '',
  };
  const { style, format, ...rest } = overrides;
  return {
    id: uid('el'),
    kind,
    x,
    y,
    w: size[kind][0],
    h: size[kind][1],
    text: text[kind],
    ...rest,
    format: { ...defaultFormat(), ...format },
    style: {
      ...defaultStyle(),
      ...(kind === 'rect' ? { borderWidth: 1 } : {}),
      ...(kind === 'line' ? { borderWidth: 1 } : {}),
      ...style,
    },
  };
}

/** A table with one column per field (up to 6), or two blank columns. */
export function createTable(x: number, y: number, w: number, fields: { name: string; type?: string }[]): ReportElement {
  const cols = fields.length ? fields.slice(0, 6).map((f) => createColumn(f.name, f.type)) : [createColumn(''), createColumn('')];
  const table = defaultTableSpec(cols);
  return createElement('table', x, y, { w, h: designTableHeight(table), text: '', table, style: { padding: 4 } });
}

export const createBand = (type: BandType, height: number, groupId?: string): Band => ({
  id: uid('band'),
  type,
  height,
  visible: true,
  groupId,
  elements: [],
});

export const emptyDataSource = (): DataSourceDef => ({
  type: 'json',
  url: '',
  inline: '',
  dataPath: '',
  headers: '',
  entitySet: '',
  select: '',
  filter: '',
  orderby: '',
  expand: '',
  top: null,
  maxRows: 5000,
});

export const defaultPage = (): PageSettings => ({
  ...PAGE_SIZES.A4,
  marginTop: 38,
  marginBottom: 38,
  marginLeft: 38,
  marginRight: 38,
});

export const contentWidth = (p: PageSettings) => p.width - p.marginLeft - p.marginRight;

export function newReport(): ReportDefinition {
  return {
    version: 1,
    name: 'New Report',
    page: defaultPage(),
    dataSource: emptyDataSource(),
    groups: [],
    sort: [],
    bands: [
      createBand('reportHeader', 60),
      createBand('pageHeader', 30),
      createBand('detail', 24),
      createBand('pageFooter', 30),
      createBand('reportFooter', 40),
    ],
  };
}

/** Bands in the order they are laid out on the page. */
export function orderedBands(r: ReportDefinition): Band[] {
  const of = (t: BandType) => r.bands.filter((b) => b.type === t);
  const groupBand = (t: BandType, gid: string) => r.bands.find((b) => b.type === t && b.groupId === gid);
  const gh = r.groups.map((g) => groupBand('groupHeader', g.id)).filter(Boolean) as Band[];
  const gf = [...r.groups].reverse().map((g) => groupBand('groupFooter', g.id)).filter(Boolean) as Band[];
  return [...of('reportHeader'), ...of('pageHeader'), ...gh, ...of('detail'), ...gf, ...of('pageFooter'), ...of('reportFooter')];
}

/** A ready-made report bound to the bundled sample JSON file. */
export function sampleReport(): ReportDefinition {
  const r = newReport();
  r.name = 'Sales Orders';
  r.dataSource = { ...emptyDataSource(), type: 'json', url: 'samples/orders.json', dataPath: 'data.items' };
  r.sort = [{ field: 'OrderDate', direction: 'asc' }];
  const band = (t: BandType) => r.bands.find((b) => b.type === t)!;

  band('reportHeader').elements.push(
    createElement('text', 0, 4, { w: 400, h: 32, text: 'Sales Orders Report', style: { fontSize: 22, bold: true, color: '#1f3a68' } }),
    createElement('text', 418, 10, { w: 300, h: 20, text: 'Printed {Now}', format: { kind: 'datetime' }, style: { align: 'right', color: '#666666' } }),
    createElement('line', 0, 46, { w: 718, h: 4, style: { borderColor: '#1f3a68', borderWidth: 2 } }),
  );

  const cols: [string, string, number, number, 'left' | 'right', Partial<FormatSpec>?][] = [
    ['Order #', 'OrderID', 0, 60, 'left'],
    ['Date', 'OrderDate', 64, 90, 'left', { kind: 'date' }],
    ['Customer', 'Customer', 158, 170, 'left'],
    ['Product', 'Product', 332, 150, 'left'],
    ['Qty', 'Quantity', 486, 50, 'right', { kind: 'number', decimals: 0 }],
    ['Unit Price', 'UnitPrice', 540, 80, 'right', { kind: 'currency' }],
    ['Amount', 'Amount', 624, 94, 'right', { kind: 'currency' }],
  ];
  for (const [label, field, x, w, align, format] of cols) {
    band('pageHeader').elements.push(createElement('text', x, 4, { w, h: 20, text: label, style: { bold: true, align, color: '#1f3a68' } }));
    band('detail').elements.push(createElement('field', x, 2, { w, h: 20, text: `{${field}}`, format, style: { align } }));
  }
  band('pageHeader').elements.push(createElement('line', 0, 26, { w: 718, h: 4, style: { borderColor: '#1f3a68' } }));

  const g = { id: uid('grp'), field: 'Country', direction: 'asc' as const };
  r.groups.push(g);
  const gh = createBand('groupHeader', 28, g.id);
  gh.elements.push(
    createElement('field', 0, 4, { w: 718, h: 22, text: 'Country: {Country}', style: { bold: true, background: '#e8eef8', padding: 4 } }),
  );
  const gf = createBand('groupFooter', 30, g.id);
  gf.elements.push(
    createElement('field', 332, 4, { w: 204, h: 20, text: '{count()} orders in {Country}', style: { italic: true, color: '#555555' } }),
    createElement('field', 540, 4, { w: 178, h: 20, text: '{sum(Amount)}', format: { kind: 'currency' }, style: { bold: true, align: 'right' } }),
    createElement('line', 540, 0, { w: 178, h: 4, style: { borderColor: '#999999' } }),
  );
  r.bands.push(gh, gf);

  band('pageFooter').elements.push(
    createElement('field', 418, 6, { w: 300, h: 20, text: 'Page {PageNumber} of {TotalPages}', style: { align: 'right', color: '#666666', fontSize: 11 } }),
    createElement('field', 0, 6, { w: 300, h: 20, text: '{ReportName}', style: { color: '#666666', fontSize: 11 } }),
  );
  band('reportFooter').elements.push(
    createElement('line', 0, 2, { w: 718, h: 4, style: { borderColor: '#1f3a68', borderWidth: 2 } }),
    createElement('text', 332, 10, { w: 204, h: 22, text: 'Grand total', style: { bold: true, fontSize: 14 } }),
    createElement('field', 540, 10, { w: 178, h: 22, text: '{sum(Amount)}', format: { kind: 'currency' }, style: { bold: true, fontSize: 14, align: 'right' } }),
  );
  return r;
}

export const defaultWatermark = (): import('./types').Watermark => ({
  enabled: false,
  kind: 'text',
  text: 'CONFIDENTIAL',
  image: '',
  opacity: 0.12,
  angle: -40,
  fontSize: 96,
  color: '#c4372f',
  bold: true,
  imageScale: 60,
  layer: 'front',
  pages: 'all',
});

export const defaultBackground = (): import('./types').PageBackground => ({ enabled: false, image: '', fit: 'cover', pages: 'all' });

export const defaultFieldOptions = (): import('./types').FieldOptions => ({ nullText: '', hideDuplicates: false, rules: [] });
