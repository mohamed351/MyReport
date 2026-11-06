import type { ReportElement } from '../model/types';

/** Must match the line-height used by ElementBox when rendering text. */
export const LINE_HEIGHT = 1.2;

let ctx2d: CanvasRenderingContext2D | null | undefined;
function context(): CanvasRenderingContext2D | null {
  if (ctx2d === undefined) {
    try {
      ctx2d = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      ctx2d = null;
    }
  }
  return ctx2d;
}

/** Whether the element grows vertically to fit its text (default: on for text and fields). */
export const canGrow = (el: ReportElement) => (el.kind === 'text' || el.kind === 'field') && el.canGrow !== false;

/** Height (px) the element needs to show `text` fully at its current width, wrapping like the renderer. */
export function measureTextHeight(text: string, el: ReportElement): number {
  const s = el.style;
  const inset = s.padding * 2 + (s.borderWidth > 0 ? s.borderWidth * 2 : 0);
  const width = Math.max(1, el.w - inset);
  const c = context();
  let measure: (t: string) => number;
  if (c) {
    c.font = `${s.italic ? 'italic ' : ''}${s.bold ? 700 : 400} ${s.fontSize}px ${s.fontFamily}`;
    measure = (t) => c.measureText(t).width;
  } else {
    measure = (t) => t.length * s.fontSize * 0.55; // rough fallback outside the browser
  }

  let lines = 0;
  for (const para of text.split('\n')) lines += countLines(para, width, measure);
  // +1px slack so rounding differences between canvas and DOM never clip the last line.
  return Math.ceil(lines * s.fontSize * LINE_HEIGHT + inset + 1);
}

function countLines(para: string, width: number, measure: (t: string) => number): number {
  if (!para) return 1;
  let n = 1;
  let line = '';
  for (const word of para.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= width) {
      line = candidate;
      continue;
    }
    if (line) n++;
    const w = measure(word);
    if (w > width) {
      // A single word wider than the box breaks across lines (word-break: break-word).
      n += Math.ceil(w / width) - 1;
      line = '';
    } else {
      line = word;
    }
  }
  return n;
}
