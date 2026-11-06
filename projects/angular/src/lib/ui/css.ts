const UNITLESS = new Set(['fontWeight', 'lineHeight', 'flex', 'zIndex', 'opacity']);

/** Builds an inline style string from a camelCase map; numbers get "px" unless unitless. */
export function css(o: Record<string, string | number | undefined | null | false>): string {
  let s = '';
  for (const [k, v] of Object.entries(o)) {
    if (v == null || v === '' || v === false) continue;
    const key = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    s += `${key}:${typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : v};`;
  }
  return s;
}
