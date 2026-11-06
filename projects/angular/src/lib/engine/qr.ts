import qrcode from 'qrcode-generator';
import type { QrSpec } from '../model/types';

// Encode text as UTF-8 so non-Latin text (e.g. Arabic) scans correctly.
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

export interface QrResult {
  /** size × size, true = dark module. */
  modules: boolean[][];
  size: number;
  error?: string;
}

export function encodeQr(value: string, level: QrSpec['errorCorrection']): QrResult {
  if (!value) return { modules: [], size: 0, error: 'Empty value' };
  try {
    const qr = qrcode(0, level);
    qr.addData(value, 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const modules = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => qr.isDark(r, c)));
    return { modules, size };
  } catch (e) {
    return { modules: [], size: 0, error: 'Value too long for a QR code' };
  }
}
