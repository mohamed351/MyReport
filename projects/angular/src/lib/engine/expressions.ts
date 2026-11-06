import type { FormatSpec } from '../model/types';

export type Row = Record<string, unknown>;

export interface EvalContext {
  row: Row | undefined;
  /** Rows in the current scope (current group, or all rows for report bands). */
  rows: Row[];
  allRows: Row[];
  pageRows: Row[];
  rowNumber: number;
  pageNumber: number;
  totalPages: number;
  reportName: string;
  /** Report parameter values, by name. */
  params?: Record<string, unknown>;
  /** The whole loaded document (e.g. a receipt object whose items are the rows); read as root.x. */
  root?: unknown;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

// ---------------------------------------------------------------------------------------------
// Formula language
//
//   literals     123  1.5  "text"  'text'  true  false  null
//   fields       Customer   address.city   [Unit Price]   (brackets for names with spaces)
//   parameters   @Country   Parameters.Country
//   operators    + - * / %   == = != <>  < <= > >=   && and  || or  ! not   cond ? a : b
//   functions    sum(Quantity * UnitPrice)  count()  iif(Amount > 100, "High", "Low")  upper(Customer) …
//   aggregates take an optional scope as last argument: sum(Amount, report) | page | group
//   specials     PageNumber TotalPages Now Today RowNumber ReportName

type Node =
  | { k: 'lit'; v: unknown }
  | { k: 'id'; name: string }
  | { k: 'param'; name: string }
  | { k: 'un'; op: '-' | '!'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'cond'; c: Node; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'param'; v: string } | { t: 'op'; v: string } | { t: 'eof' };

const IDENT = /^[A-Za-z_À-￿][\w.À-￿]*/;
const OPS = ['==', '!=', '<>', '<=', '>=', '&&', '||', '<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '(', ')', ',', '='];

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(s[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(s.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = '';
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\' && j + 1 < s.length) {
          j++;
          v += s[j] === 'n' ? '\n' : s[j];
        } else v += s[j];
        j++;
      }
      if (j >= s.length) throw new Error('Unterminated string');
      out.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    if (c === '[') {
      const j = s.indexOf(']', i);
      if (j < 0) throw new Error('Missing ]');
      out.push({ t: 'id', v: s.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (c === '@') {
      const m = IDENT.exec(s.slice(i + 1));
      if (!m) throw new Error('Parameter name expected after @');
      out.push({ t: 'param', v: m[0] });
      i += 1 + m[0].length;
      continue;
    }
    const m = IDENT.exec(s.slice(i));
    if (m) {
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (op) {
      out.push({ t: 'op', v: op });
      i += op.length;
      continue;
    }
    throw new Error(`Unexpected "${c}"`);
  }
  out.push({ t: 'eof' });
  return out;
}

const tokText = (t: Tok) => (t.t === 'eof' ? 'end' : String(t.v));

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek().t === 'op' && (peek() as { v: string }).v === v;
  const isKw = (v: string) => peek().t === 'id' && (peek() as { v: string }).v.toLowerCase() === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}" but found "${tokText(peek())}"`);
    p++;
  };
  const opv = () => (toks[p++] as { v: string }).v;

  function ternary(): Node {
    const c = or();
    if (isOp('?')) {
      p++;
      const a = ternary();
      expect(':');
      return { k: 'cond', c, a, b: ternary() };
    }
    return c;
  }
  function or(): Node {
    let a = and();
    while (isOp('||') || isKw('or')) {
      p++;
      a = { k: 'bin', op: '||', a, b: and() };
    }
    return a;
  }
  function and(): Node {
    let a = eq();
    while (isOp('&&') || isKw('and')) {
      p++;
      a = { k: 'bin', op: '&&', a, b: eq() };
    }
    return a;
  }
  function eq(): Node {
    let a = rel();
    for (;;) {
      if (isOp('==') || isOp('=')) {
        p++;
        a = { k: 'bin', op: '==', a, b: rel() };
      } else if (isOp('!=') || isOp('<>')) {
        p++;
        a = { k: 'bin', op: '!=', a, b: rel() };
      } else return a;
    }
  }
  function rel(): Node {
    let a = add();
    while (['<', '<=', '>', '>='].some(isOp)) a = { k: 'bin', op: opv(), a, b: add() };
    return a;
  }
  function add(): Node {
    let a = mul();
    while (isOp('+') || isOp('-')) a = { k: 'bin', op: opv(), a, b: mul() };
    return a;
  }
  function mul(): Node {
    let a = unary();
    while (isOp('*') || isOp('/') || isOp('%')) a = { k: 'bin', op: opv(), a, b: unary() };
    return a;
  }
  function unary(): Node {
    if (isOp('-')) {
      p++;
      return { k: 'un', op: '-', a: unary() };
    }
    if (isOp('!') || isKw('not')) {
      p++;
      return { k: 'un', op: '!', a: unary() };
    }
    return primary();
  }
  function primary(): Node {
    const t = toks[p++];
    switch (t.t) {
      case 'num':
      case 'str':
        return { k: 'lit', v: t.v };
      case 'param':
        return { k: 'param', name: t.v };
      case 'id': {
        const low = t.v.toLowerCase();
        if (low === 'true' || low === 'false') return { k: 'lit', v: low === 'true' };
        if (low === 'null') return { k: 'lit', v: null };
        if (isOp('(')) {
          p++;
          const args: Node[] = [];
          if (!isOp(')')) {
            args.push(ternary());
            while (isOp(',')) {
              p++;
              args.push(ternary());
            }
          }
          expect(')');
          if (!FUNCTIONS_BY_NAME.has(low)) throw new Error(`Unknown function "${t.v}"`);
          return { k: 'call', name: low, args };
        }
        return { k: 'id', name: t.v };
      }
      case 'op':
        if (t.v === '(') {
          const e = ternary();
          expect(')');
          return e;
        }
        throw new Error(`Unexpected "${t.v}"`);
      default:
        throw new Error('Incomplete expression');
    }
  }

  const node = ternary();
  if (peek().t !== 'eof') throw new Error(`Unexpected "${tokText(peek())}"`);
  return node;
}

const cache = new Map<string, Node>();
function compile(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    n = parse(src);
    if (cache.size > 5000) cache.clear();
    cache.set(src, n);
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Evaluation

const toNumber = (v: unknown): number =>
  typeof v === 'number' ? v : v instanceof Date ? v.getTime() : v == null || v === '' ? NaN : typeof v === 'boolean' ? +v : Number(v);

function numLike(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return +v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export const truthy = (v: unknown) => !(v == null || v === false || v === 0 || v === '' || (typeof v === 'number' && Number.isNaN(v)));

function compare(a: unknown, b: unknown): number {
  const na = numLike(a);
  const nb = numLike(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
}

function equals(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return (a == null || a === '') && (b == null || b === '');
  const na = numLike(a);
  const nb = numLike(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a) === String(b);
}

function param(ctx: EvalContext, name: string): unknown {
  const p = ctx.params ?? {};
  if (name in p) return p[name];
  const key = Object.keys(p).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? p[key] : undefined;
}

function resolveId(name: string, ctx: EvalContext): unknown {
  if (ctx.row) {
    const v = getPath(ctx.row, name);
    if (v !== undefined) return v;
  }
  const low = name.toLowerCase();
  switch (low) {
    case 'pagenumber':
      return ctx.pageNumber;
    case 'totalpages':
      return ctx.totalPages;
    case 'now':
      return new Date();
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'rownumber':
      return ctx.rowNumber;
    case 'reportname':
      return ctx.reportName;
  }
  if (low.startsWith('parameters.')) return param(ctx, name.slice('parameters.'.length));
  if (low === 'root') return ctx.root;
  if (low.startsWith('root.')) return getPath(ctx.root, name.slice(5));
  return undefined;
}

function evalNode(n: Node, ctx: EvalContext): unknown {
  switch (n.k) {
    case 'lit':
      return n.v;
    case 'param':
      return param(ctx, n.name);
    case 'id':
      return resolveId(n.name, ctx);
    case 'un': {
      const v = evalNode(n.a, ctx);
      return n.op === '-' ? -toNumber(v) : !truthy(v);
    }
    case 'cond':
      return truthy(evalNode(n.c, ctx)) ? evalNode(n.a, ctx) : evalNode(n.b, ctx);
    case 'bin': {
      if (n.op === '&&') return truthy(evalNode(n.a, ctx)) && truthy(evalNode(n.b, ctx));
      if (n.op === '||') return truthy(evalNode(n.a, ctx)) || truthy(evalNode(n.b, ctx));
      const a = evalNode(n.a, ctx);
      const b = evalNode(n.b, ctx);
      switch (n.op) {
        case '==':
          return equals(a, b);
        case '!=':
          return !equals(a, b);
        case '<':
          return compare(a, b) < 0;
        case '<=':
          return compare(a, b) <= 0;
        case '>':
          return compare(a, b) > 0;
        case '>=':
          return compare(a, b) >= 0;
        case '+':
          // Text joins; numbers add.
          if ((typeof a === 'string' && numLike(a) === null) || (typeof b === 'string' && numLike(b) === null) || a == null || b == null) {
            if (a == null && b == null) return null;
            if (numLike(a) !== null && b == null) return toNumber(a);
            if (numLike(b) !== null && a == null) return toNumber(b);
            return String(a ?? '') + String(b ?? '');
          }
          return toNumber(a) + toNumber(b);
        case '-':
          return toNumber(a) - toNumber(b);
        case '*':
          return toNumber(a) * toNumber(b);
        case '/': {
          const d = toNumber(b);
          return d === 0 ? null : toNumber(a) / d;
        }
        case '%':
          return toNumber(a) % toNumber(b);
      }
      throw new Error(`Unknown operator ${n.op}`);
    }
    case 'call':
      return callFunction(n.name, n.args, ctx);
  }
}

const SCOPES = new Set(['report', 'all', 'page', 'group']);
export const AGGREGATES = ['sum', 'avg', 'min', 'max', 'count', 'first', 'last', 'distinctcount'];
const AGG = new Set(AGGREGATES);

function callFunction(name: string, args: Node[], ctx: EvalContext): unknown {
  if (AGG.has(name)) {
    const last = args[args.length - 1];
    const scope = last && last.k === 'id' && SCOPES.has(last.name.toLowerCase()) ? last.name.toLowerCase() : null;
    const a = scope ? args.slice(0, -1) : args;
    // min(a, b) / max(a, b) with 2+ values: plain numeric min/max.
    if ((name === 'min' || name === 'max') && a.length >= 2) {
      const nums = a.map((x) => toNumber(evalNode(x, ctx))).filter((x) => !Number.isNaN(x));
      return nums.length ? (name === 'min' ? Math.min(...nums) : Math.max(...nums)) : null;
    }
    const set = scope === 'report' || scope === 'all' ? ctx.allRows : scope === 'page' ? ctx.pageRows ?? ctx.rows : ctx.rows;
    if (name === 'count' && !a.length) return set.length;
    if (!a.length) throw new Error(`${name}() needs a field or expression`);
    const values = set.map((r) => evalNode(a[0], { ...ctx, row: r }));
    return reduceAggregate(name, values);
  }
  const v = args.map((x) => evalNode(x, ctx));
  const s = (i: number) => (v[i] == null ? '' : v[i] instanceof Date ? (v[i] as Date).toLocaleString() : String(v[i]));
  const n = (i: number) => toNumber(v[i]);
  const d = (i: number) => toDate(v[i]);
  switch (name) {
    // logic
    case 'iif':
    case 'if':
      return truthy(v[0]) ? v[1] : v[2];
    case 'isnull':
    case 'coalesce':
      return v.find((x) => x != null && x !== '') ?? (name === 'isnull' ? v[1] : null);
    case 'isempty':
      return v[0] == null || v[0] === '';
    // text
    case 'upper':
      return s(0).toUpperCase();
    case 'lower':
      return s(0).toLowerCase();
    case 'trim':
      return s(0).trim();
    case 'len':
    case 'length':
      return s(0).length;
    case 'left':
      return s(0).slice(0, Math.max(0, n(1)));
    case 'right':
      return n(1) > 0 ? s(0).slice(-n(1)) : '';
    case 'substr':
      return s(0).substr(n(1), args.length > 2 ? n(2) : undefined);
    case 'replace':
      return s(0).split(s(1)).join(s(2));
    case 'concat':
      return v.map((_, i) => s(i)).join('');
    case 'contains':
      return s(0).toLowerCase().includes(s(1).toLowerCase());
    case 'startswith':
      return s(0).toLowerCase().startsWith(s(1).toLowerCase());
    case 'endswith':
      return s(0).toLowerCase().endsWith(s(1).toLowerCase());
    case 'padleft':
      return s(0).padStart(n(1), args.length > 2 ? s(2) : ' ');
    case 'tostring':
      return s(0);
    // math
    case 'round': {
      const f = Math.pow(10, args.length > 1 ? n(1) : 0);
      return Math.round(n(0) * f) / f;
    }
    case 'floor':
      return Math.floor(n(0));
    case 'ceil':
      return Math.ceil(n(0));
    case 'abs':
      return Math.abs(n(0));
    case 'sqrt':
      return Math.sqrt(n(0));
    case 'pow':
      return Math.pow(n(0), n(1));
    case 'tonumber':
      return n(0);
    // dates
    case 'now':
      return new Date();
    case 'today': {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      return t;
    }
    case 'year':
      return d(0)?.getFullYear() ?? null;
    case 'month':
      return d(0) ? d(0)!.getMonth() + 1 : null;
    case 'day':
      return d(0)?.getDate() ?? null;
    case 'dateadd': {
      const t = d(0);
      if (!t) return null;
      const r = new Date(t);
      const unit = (s(2) || 'day').toLowerCase();
      if (unit.startsWith('year')) r.setFullYear(r.getFullYear() + n(1));
      else if (unit.startsWith('month')) r.setMonth(r.getMonth() + n(1));
      else r.setDate(r.getDate() + n(1));
      return r;
    }
    case 'datediff': {
      const a = d(0);
      const b = d(1);
      if (!a || !b) return null;
      const unit = (s(2) || 'day').toLowerCase();
      if (unit.startsWith('year')) return b.getFullYear() - a.getFullYear();
      if (unit.startsWith('month')) return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
      return Math.round((b.getTime() - a.getTime()) / 86400000);
    }
    case 'formatdate': {
      const t = d(0);
      return t ? formatDatePattern(t, s(1) || 'yyyy-MM-dd') : '';
    }
    case 'format': {
      const kind = (s(1) || 'number') as FormatSpec['kind'];
      return formatValue(v[0], { kind, decimals: args.length > 2 ? n(2) : 2, currency: args.length > 3 ? s(3) : 'USD' });
    }
  }
  throw new Error(`Unknown function ${name}`);
}

function reduceAggregate(fn: string, values: unknown[]): unknown {
  switch (fn) {
    case 'count':
      return values.filter((x) => x != null && x !== '').length;
    case 'first':
      return values[0];
    case 'last':
      return values[values.length - 1];
    case 'distinctcount':
      return new Set(values.map((x) => String(x))).size;
  }
  const nums = values.map(toNumber).filter((x) => !Number.isNaN(x));
  switch (fn) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case 'min':
      return nums.length ? Math.min(...nums) : null;
    case 'max':
      return nums.length ? Math.max(...nums) : null;
  }
  throw new Error(`Unknown aggregate ${fn}`);
}

const SIMPLE_PATH = /^[A-Za-z_À-￿][\w.À-￿]*$/;

/** Aggregates a field (or expression) over rows — used by charts and cross tables. */
export function aggregate(fn: string, field: string, rows: Row[]): unknown {
  const ctx: EvalContext = { row: undefined, rows, allRows: rows, pageRows: rows, rowNumber: 0, pageNumber: 1, totalPages: 1, reportName: '' };
  if (!field) return fn === 'count' ? rows.length : null;
  const arg = SIMPLE_PATH.test(field) ? field : `[${field}]`;
  return evaluate(`${fn}(${arg})`, ctx);
}

/** Evaluates one expression (the part inside `{}`). */
export function evaluate(expr: string, ctx: EvalContext): unknown {
  const e = expr.trim();
  if (!e) return '';
  return evalNode(compile(e), ctx);
}

/** Parse error message for an expression, or null when valid. */
export function checkExpression(expr: string): string | null {
  if (!expr.trim()) return null;
  try {
    compile(expr.trim());
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** First parse error among the `{…}` parts of a template, or null. */
export function checkTemplate(template: string): string | null {
  const open = (template.match(/\{/g) ?? []).length;
  const close = (template.match(/\}/g) ?? []).length;
  if (open !== close) return open > close ? 'Missing }' : 'Unexpected }';
  for (const m of template.matchAll(/\{([^{}]*)\}/g)) {
    const err = checkExpression(m[1]);
    if (err) return `{${m[1]}}: ${err}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Formatting

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const ms = /\/Date\((-?\d+)/.exec(v); // OData v2 "/Date(1234567890)/"
    const d = ms ? new Date(Number(ms[1])) : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** yyyy yy MMM MM M dd d HH H mm ss */
export function formatDatePattern(d: Date, pattern: string): string {
  const p2 = (x: number) => String(x).padStart(2, '0');
  return pattern.replace(/yyyy|yy|MMM|MM|M|dd|d|HH|H|mm|ss/g, (t) => {
    switch (t) {
      case 'yyyy':
        return String(d.getFullYear());
      case 'yy':
        return p2(d.getFullYear() % 100);
      case 'MMM':
        return MONTHS[d.getMonth()];
      case 'MM':
        return p2(d.getMonth() + 1);
      case 'M':
        return String(d.getMonth() + 1);
      case 'dd':
        return p2(d.getDate());
      case 'd':
        return String(d.getDate());
      case 'HH':
        return p2(d.getHours());
      case 'H':
        return String(d.getHours());
      case 'mm':
        return p2(d.getMinutes());
      default:
        return p2(d.getSeconds());
    }
  });
}

export function formatValue(v: unknown, f: FormatSpec): string {
  if (v == null) return '';
  const d = f.decimals ?? 2;
  try {
    switch (f.kind) {
      case 'number':
      case 'currency':
      case 'percent': {
        const n = toNumber(v);
        if (Number.isNaN(n)) return String(v);
        return n.toLocaleString(undefined, {
          style: f.kind === 'number' ? 'decimal' : f.kind,
          currency: f.kind === 'currency' ? f.currency || 'USD' : undefined,
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        });
      }
      case 'date':
      case 'datetime':
      case 'time': {
        const dt = toDate(v);
        if (!dt) return String(v);
        if (f.kind === 'date') return dt.toLocaleDateString();
        if (f.kind === 'time') return dt.toLocaleTimeString();
        return dt.toLocaleString();
      }
    }
  } catch {
    return String(v);
  }
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number' && !Number.isInteger(v)) return String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Replaces every `{expr}` in the template with its formatted value. */
export function renderTemplate(template: string, ctx: EvalContext, format: FormatSpec): string {
  return template.replace(/\{([^{}]+)\}/g, (_, ex: string) => {
    try {
      return formatValue(evaluate(ex, ctx), format);
    } catch {
      return '#ERR';
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Function catalogue (drives autocomplete and validation)

export interface FunctionInfo {
  name: string;
  signature: string;
  description: string;
  group: 'Aggregate' | 'Logic' | 'Text' | 'Math' | 'Date' | 'Format';
}

export const FUNCTIONS: FunctionInfo[] = [
  { name: 'sum', signature: 'sum(expr [, report|page])', description: 'Total over the rows in scope', group: 'Aggregate' },
  { name: 'avg', signature: 'avg(expr [, scope])', description: 'Average', group: 'Aggregate' },
  { name: 'min', signature: 'min(expr [, scope]) | min(a, b)', description: 'Smallest value', group: 'Aggregate' },
  { name: 'max', signature: 'max(expr [, scope]) | max(a, b)', description: 'Largest value', group: 'Aggregate' },
  { name: 'count', signature: 'count([expr] [, scope])', description: 'Number of rows / non-empty values', group: 'Aggregate' },
  { name: 'distinctcount', signature: 'distinctcount(expr)', description: 'Number of different values', group: 'Aggregate' },
  { name: 'first', signature: 'first(expr)', description: 'Value in the first row of the scope', group: 'Aggregate' },
  { name: 'last', signature: 'last(expr)', description: 'Value in the last row of the scope', group: 'Aggregate' },
  { name: 'iif', signature: 'iif(condition, then, else)', description: 'Pick a value by condition', group: 'Logic' },
  { name: 'isnull', signature: 'isnull(value, fallback)', description: 'Fallback when empty', group: 'Logic' },
  { name: 'coalesce', signature: 'coalesce(a, b, …)', description: 'First non-empty value', group: 'Logic' },
  { name: 'isempty', signature: 'isempty(value)', description: 'True when empty', group: 'Logic' },
  { name: 'upper', signature: 'upper(text)', description: 'UPPER CASE', group: 'Text' },
  { name: 'lower', signature: 'lower(text)', description: 'lower case', group: 'Text' },
  { name: 'trim', signature: 'trim(text)', description: 'Remove surrounding spaces', group: 'Text' },
  { name: 'len', signature: 'len(text)', description: 'Length', group: 'Text' },
  { name: 'left', signature: 'left(text, n)', description: 'First n characters', group: 'Text' },
  { name: 'right', signature: 'right(text, n)', description: 'Last n characters', group: 'Text' },
  { name: 'substr', signature: 'substr(text, start, [length])', description: 'Part of text (start at 0)', group: 'Text' },
  { name: 'replace', signature: 'replace(text, find, with)', description: 'Replace all occurrences', group: 'Text' },
  { name: 'concat', signature: 'concat(a, b, …)', description: 'Join text', group: 'Text' },
  { name: 'contains', signature: 'contains(text, part)', description: 'True if text contains part', group: 'Text' },
  { name: 'startswith', signature: 'startswith(text, part)', description: 'True if text starts with part', group: 'Text' },
  { name: 'endswith', signature: 'endswith(text, part)', description: 'True if text ends with part', group: 'Text' },
  { name: 'padleft', signature: 'padleft(text, width, [char])', description: 'Pad on the left, e.g. 00042', group: 'Text' },
  { name: 'tostring', signature: 'tostring(value)', description: 'Convert to text', group: 'Text' },
  { name: 'round', signature: 'round(number, [decimals])', description: 'Round', group: 'Math' },
  { name: 'floor', signature: 'floor(number)', description: 'Round down', group: 'Math' },
  { name: 'ceil', signature: 'ceil(number)', description: 'Round up', group: 'Math' },
  { name: 'abs', signature: 'abs(number)', description: 'Absolute value', group: 'Math' },
  { name: 'sqrt', signature: 'sqrt(number)', description: 'Square root', group: 'Math' },
  { name: 'pow', signature: 'pow(number, power)', description: 'Power', group: 'Math' },
  { name: 'tonumber', signature: 'tonumber(text)', description: 'Convert to number', group: 'Math' },
  { name: 'now', signature: 'now()', description: 'Current date and time', group: 'Date' },
  { name: 'today', signature: 'today()', description: 'Today at 00:00', group: 'Date' },
  { name: 'year', signature: 'year(date)', description: 'Year', group: 'Date' },
  { name: 'month', signature: 'month(date)', description: 'Month 1–12', group: 'Date' },
  { name: 'day', signature: 'day(date)', description: 'Day of month', group: 'Date' },
  { name: 'dateadd', signature: 'dateadd(date, n, "day"|"month"|"year")', description: 'Add to a date', group: 'Date' },
  { name: 'datediff', signature: 'datediff(from, to, "day"|"month"|"year")', description: 'Difference between dates', group: 'Date' },
  { name: 'formatdate', signature: 'formatdate(date, "dd/MM/yyyy")', description: 'Date as text: yyyy MM MMM dd HH mm ss', group: 'Date' },
  { name: 'format', signature: 'format(value, "currency"|"number"|"percent"|"date", [decimals], [currency])', description: 'Format a value', group: 'Format' },
];
const FUNCTIONS_BY_NAME = new Set([...FUNCTIONS.map((f) => f.name), 'if', 'length']);

export const SPECIAL_FIELDS = ['PageNumber', 'TotalPages', 'Now', 'Today', 'RowNumber', 'ReportName'];

/** Scalar values of a document as root.x paths (arrays skipped) — for the field list and autocomplete. */
export function documentFields(root: unknown): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
  const visit = (o: unknown, prefix: string, depth: number) => {
    if (!o || typeof o !== 'object' || Array.isArray(o) || depth > 3) return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k.startsWith('@') || k.startsWith('__') || Array.isArray(v)) continue;
      if (v && typeof v === 'object') visit(v, prefix + k + '.', depth + 1);
      else out.push({ name: prefix + k, type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string' });
    }
  };
  visit(root, 'root.', 0);
  return out;
}
