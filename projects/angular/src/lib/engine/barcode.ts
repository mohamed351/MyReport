import type { BarcodeSymbology } from '../model/types';

export interface BarcodeResult {
  /** One char per module: '1' = bar, '0' = space. Empty when `error` is set. */
  modules: string;
  /** Human-readable text printed under the bars. */
  text: string;
  error?: string;
}

// Code 128 symbol widths (bar, space, bar, space, bar, space) for values 0–105, then STOP (106).
const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

const widthsToModules = (w: string) => [...w].map((n, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(n))).join('');

/**
 * Code 128: code set B for text, switching to code set C for runs of 4+ digits (denser).
 * Supports printable ASCII (32–126).
 */
export function encodeCode128(value: string): BarcodeResult {
  if (!value) return { modules: '', text: '', error: 'Empty value' };
  if (![...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)) {
    return { modules: '', text: value, error: 'Code 128 supports printable ASCII only' };
  }
  const digitRun = (i: number) => {
    let n = 0;
    while (i + n < value.length && value[i + n] >= '0' && value[i + n] <= '9') n++;
    return n;
  };

  const codes: number[] = [];
  let set: 'B' | 'C';
  let i = 0;
  const first = digitRun(0);
  if (first >= 4) {
    set = 'C';
    codes.push(START_C);
  } else {
    set = 'B';
    codes.push(START_B);
  }

  while (i < value.length) {
    const run = digitRun(i);
    if (set === 'C') {
      if (run >= 2) {
        codes.push(Number(value.slice(i, i + 2)));
        i += 2;
        continue;
      }
      codes.push(CODE_B);
      set = 'B';
    }
    // Switch to C for a run of >= 4 digits; an odd run keeps its first digit in B.
    if (run >= 4) {
      if (run % 2 === 1) {
        codes.push(value.charCodeAt(i) - 32);
        i++;
      }
      codes.push(CODE_C);
      set = 'C';
      continue;
    }
    codes.push(value.charCodeAt(i) - 32);
    i++;
  }

  const checksum = codes.reduce((sum, c, idx) => sum + c * (idx === 0 ? 1 : idx), 0) % 103;
  codes.push(checksum, STOP);
  return { modules: codes.map((c) => widthsToModules(CODE128[c])).join(''), text: value };
}

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_R = EAN_L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const EAN_G = EAN_R.map((p) => [...p].reverse().join(''));
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13CheckDigit(first12: string): number {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** EAN-13 from 12 digits (check digit added) or 13 digits (check digit verified). */
export function encodeEan13(value: string): BarcodeResult {
  const v = value.replace(/\s+/g, '');
  if (!/^\d{12,13}$/.test(v)) return { modules: '', text: value, error: 'EAN-13 needs 12 or 13 digits' };
  const check = ean13CheckDigit(v.slice(0, 12));
  if (v.length === 13 && Number(v[12]) !== check) return { modules: '', text: value, error: `Invalid check digit (expected ${check})` };
  const digits = v.slice(0, 12) + check;
  const parity = EAN_PARITY[Number(digits[0])];
  let m = '101';
  for (let k = 1; k <= 6; k++) m += (parity[k - 1] === 'L' ? EAN_L : EAN_G)[Number(digits[k])];
  m += '01010';
  for (let k = 7; k <= 12; k++) m += EAN_R[Number(digits[k])];
  m += '101';
  return { modules: m, text: digits };
}

export function encodeBarcode(symbology: BarcodeSymbology, value: string): BarcodeResult {
  return symbology === 'ean13' ? encodeEan13(value) : encodeCode128(value);
}
