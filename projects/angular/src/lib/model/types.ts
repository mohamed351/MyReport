// Report definition model. This JSON shape is the contract between the
// designer and any renderer (the browser preview here, or a server engine later).

export type BandType =
  | 'reportHeader'
  | 'pageHeader'
  | 'groupHeader'
  | 'detail'
  | 'groupFooter'
  | 'pageFooter'
  | 'reportFooter';

export type ElementKind = 'text' | 'field' | 'line' | 'rect' | 'image' | 'table' | 'chart' | 'barcode' | 'qrcode' | 'crosstab';
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface ElementStyle {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  background: string; // css color or 'transparent'
  align: HAlign;
  vAlign: VAlign;
  borderWidth: number;
  borderColor: string;
  padding: number;
}

export type FormatKind = 'none' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'time';

export interface FormatSpec {
  kind: FormatKind;
  decimals: number;
  currency: string;
}

export interface ReportElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Template text. `{Field}`, `{sum(Amount)}`, `{PageNumber}`… For images: the URL (may contain {Field}). */
  text: string;
  format: FormatSpec;
  style: ElementStyle;
  /** Text/field grows taller to fit its content (pushing elements below down). Default true. */
  canGrow?: boolean;
  /** Only for kind 'table'. */
  table?: TableSpec;
  /** Only for kind 'chart'. */
  chart?: ChartSpec;
  /** Only for kind 'barcode' (the value is the `text` template). */
  barcode?: BarcodeSpec;
  /** Only for kind 'qrcode' (the value is the `text` template). */
  qr?: QrSpec;
  /** Only for kind 'crosstab'. */
  crosstab?: CrossTabSpec;
  /** Expression; the element is hidden when it evaluates to false, e.g. "Amount > 100". */
  visibleWhen?: string;
  /** Extra options for labels and fields. */
  fieldOptions?: FieldOptions;
  /** Lines and rectangles: stroke style. */
  dash?: 'solid' | 'dashed' | 'dotted';
  /** Images: how the picture fits its box. */
  imageFit?: 'contain' | 'cover' | 'fill';
}

export interface FieldOptions {
  /** Shown when the text evaluates to empty. */
  nullText: string;
  /** In repeating bands, leave the box empty when the value equals the previous row's (per page). */
  hideDuplicates: boolean;
  /** Conditional formatting: first matching rule wins. */
  rules: StyleRule[];
}

export interface StyleRule {
  /** Expression, e.g. "Amount > 1000". */
  when: string;
  color: string;
  /** '' = unchanged */
  background: string;
  bold: boolean;
}

export interface TableColumn {
  id: string;
  header: string;
  /** Cell template evaluated per row, e.g. "{Amount}". */
  text: string;
  /** Optional footer (totals) template, e.g. "{sum(Amount)}". */
  footer: string;
  /** Relative width; columns share the table width in proportion. */
  width: number;
  align: HAlign;
  format: FormatSpec;
}

/**
 * A table lists the rows in its band's scope: all rows in Report Header/Footer, the group's
 * rows in Group Header/Footer, the current record in Detail. It flows across pages.
 */
export interface TableSpec {
  columns: TableColumn[];
  showHeader: boolean;
  repeatHeader: boolean;
  showFooter: boolean;
  headerHeight: number;
  rowHeight: number;
  headerBackground: string;
  headerColor: string;
  /** Alternate-row background or 'transparent'. */
  stripeBackground: string;
  /** Grid line color or 'transparent'. */
  gridColor: string;
}

export interface Band {
  id: string;
  type: BandType;
  height: number;
  visible: boolean;
  groupId?: string;
  elements: ReportElement[];
}

export interface Group {
  id: string;
  field: string;
  direction: 'asc' | 'desc';
}

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PageSettings {
  width: number; // px @ 96dpi
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Receipt roll: one page as long as its content, no page breaks; the page footer follows the content. */
  continuous?: boolean;
}

export type DataSourceType = 'json' | 'odata';

export interface DataSourceDef {
  type: DataSourceType;
  /** JSON: file/API URL. OData: service root URL (or full entity-set URL). */
  url: string;
  /** JSON only: pasted JSON used instead of the URL when non-empty. */
  inline: string;
  /** JSON only: dot path to the array inside the response, e.g. "data.items". */
  dataPath: string;
  /** Extra request headers, one "Name: value" per line. */
  headers: string;
  // OData query options
  entitySet: string;
  select: string;
  filter: string;
  orderby: string;
  expand: string;
  top: number | null;
  /** Safety cap when following OData nextLink paging. */
  maxRows: number;
}

export interface ReportDefinition {
  version: 1;
  name: string;
  page: PageSettings;
  dataSource: DataSourceDef;
  groups: Group[];
  sort: SortSpec[];
  bands: Band[];
  /** Values the user supplies at run time; used as @Name in formulas and {@Name} in the data source. */
  parameters?: ReportParameter[];
  /** Expression applied to every data row; rows where it is false are left out, e.g. "Country == @Country". */
  filter?: string;
  watermark?: Watermark;
  background?: PageBackground;
}

export type ParameterType = 'string' | 'number' | 'date' | 'boolean';

export interface ReportParameter {
  name: string;
  label: string;
  type: ParameterType;
  defaultValue: string;
  /** Comma-separated choices; empty = free input. */
  options: string;
}

export interface Watermark {
  enabled: boolean;
  kind: 'text' | 'image';
  text: string;
  /** URL or data: URL. */
  image: string;
  /** 0–1 */
  opacity: number;
  /** Degrees, e.g. -45. */
  angle: number;
  fontSize: number;
  color: string;
  bold: boolean;
  /** Image width as % of the page width. */
  imageScale: number;
  layer: 'behind' | 'front';
  pages: 'all' | 'first';
}

export interface PageBackground {
  enabled: boolean;
  /** URL or data: URL. */
  image: string;
  fit: 'cover' | 'contain' | 'stretch' | 'center';
  pages: 'all' | 'first';
}

export type AggregateKind = 'sum' | 'count' | 'avg' | 'min' | 'max';
export type ChartType = 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'doughnut';

/** A chart over the rows in its band's scope, grouped by a category field. */
export interface ChartSpec {
  type: ChartType;
  title: string;
  categoryField: string;
  /** One series per value field (pie/doughnut use the first). */
  valueFields: string[];
  aggregate: AggregateKind;
  sort: 'none' | 'category' | 'valueDesc' | 'valueAsc';
  /** Extra categories fold into "Other". */
  maxCategories: number;
  showLegend: boolean;
  showValues: boolean;
  showGrid: boolean;
  valueFormat: FormatSpec;
}

export type BarcodeSymbology = 'code128' | 'ean13';

export interface BarcodeSpec {
  symbology: BarcodeSymbology;
  showText: boolean;
  color: string;
}

export interface QrSpec {
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  color: string;
}

/** Pivot: one row per rowField value, one column per columnField value, cells = aggregate(valueField). */
export interface CrossTabSpec {
  rowField: string;
  columnField: string;
  valueField: string;
  aggregate: AggregateKind;
  cornerText: string;
  showRowTotals: boolean;
  showColumnTotals: boolean;
  valueFormat: FormatSpec;
  headerHeight: number;
  rowHeight: number;
  headerBackground: string;
  headerColor: string;
  stripeBackground: string;
  gridColor: string;
  repeatHeader: boolean;
}
