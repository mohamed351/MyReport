import type { ReportDefinition } from '../model/types';
import { validateReport } from './designer.store';

/**
 * Normalizes a report given as an object or a JSON string (Web Component attributes are strings).
 * Returns null when nothing usable was given.
 */
export function parseReport(v: ReportDefinition | string | null | undefined): ReportDefinition | null {
  if (v == null || v === '') return null;
  try {
    return validateReport(typeof v === 'string' ? JSON.parse(v) : structuredClone(v));
  } catch (e) {
    console.error('[myreport] invalid report:', (e as Error).message);
    return null;
  }
}

/** Parameter values as an object, a JSON string, or a query string ("Country=Egypt&Year=2024"). */
export function parseParams(v: Record<string, unknown> | string | null | undefined): Record<string, unknown> {
  if (v == null || v === '') return {};
  if (typeof v !== 'string') return { ...v };
  const s = v.trim();
  if (s.startsWith('{')) {
    try {
      return JSON.parse(s);
    } catch {
      console.error('[myreport] params is not valid JSON:', s);
      return {};
    }
  }
  const out: Record<string, unknown> = {};
  new URLSearchParams(s.replace(/^\?/, '')).forEach((val, k) => (out[k.replace(/^(param|p)\./i, '')] = val));
  return out;
}
