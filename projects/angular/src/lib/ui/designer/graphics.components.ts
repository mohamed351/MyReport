import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ReportElement } from '../../model/types';
import type { Row } from '../../engine/expressions';
import { layoutChart } from '../../engine/chartLayout';
import { encodeBarcode } from '../../engine/barcode';
import { encodeQr } from '../../engine/qr';

/** Chart element: SVG drawn from the engine's layout primitives. Marks carry a hover tooltip. */
@Component({
  selector: 'rpt-chart-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'position:absolute;inset:0;display:block' },
  template: `
    <svg [attr.width]="el().w" [attr.height]="el().h" [attr.viewBox]="'0 0 ' + el().w + ' ' + el().h" [attr.font-family]="el().style.fontFamily" style="display:block;overflow:visible">
      @for (p of prims(); track $index) {
        @switch (p.t) {
          @case ('path') {
            <path [attr.d]="p.d" [attr.fill]="p.fill" [attr.stroke]="p.stroke ?? null" [attr.stroke-width]="p.sw ?? null" [attr.fill-opacity]="p.opacity ?? null">
              @if (p.title) { <title>{{ p.title }}</title> }
            </path>
          }
          @case ('line') {
            <line [attr.x1]="p.x1" [attr.y1]="p.y1" [attr.x2]="p.x2" [attr.y2]="p.y2" [attr.stroke]="p.stroke" [attr.stroke-width]="p.sw" shape-rendering="crispEdges" />
          }
          @case ('poly') {
            <polyline [attr.points]="p.points" fill="none" [attr.stroke]="p.stroke" [attr.stroke-width]="p.sw" stroke-linejoin="round" stroke-linecap="round" />
          }
          @case ('circle') {
            <circle [attr.cx]="p.cx" [attr.cy]="p.cy" [attr.r]="p.r" [attr.fill]="p.fill" [attr.stroke]="p.stroke" [attr.stroke-width]="p.sw">
              @if (p.title) { <title>{{ p.title }}</title> }
            </circle>
          }
          @case ('text') {
            <text [attr.x]="p.x" [attr.y]="p.y" [attr.text-anchor]="p.anchor" [attr.font-size]="p.size" [attr.font-weight]="p.weight" [attr.fill]="p.fill">{{ p.text }}</text>
          }
        }
      }
    </svg>
  `,
})
export class ChartViewComponent {
  readonly el = input.required<ReportElement>();
  readonly rows = input<Row[]>([]);
  readonly prims = computed(() => {
    const el = this.el();
    return el.chart ? layoutChart(el.chart, this.rows(), el.w, el.h, el.style.fontSize, el.style.color) : [];
  });
}

/** Barcode element (Code 128 / EAN-13): bars as one crisp SVG path, optional human-readable text. */
@Component({
  selector: 'rpt-barcode-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'position:absolute;inset:0;display:block' },
  template: `
    <svg [attr.width]="el().w" [attr.height]="el().h" style="display:block">
      @if (model(); as m) {
        @if (m.error) {
          <text [attr.x]="el().w / 2" [attr.y]="el().h / 2" text-anchor="middle" font-size="11" fill="#c4372f">{{ m.error }}</text>
        } @else {
          <path [attr.d]="m.d" [attr.fill]="color()" shape-rendering="crispEdges" />
          @if (m.showText) {
            <text [attr.x]="el().w / 2" [attr.y]="el().h - 2" text-anchor="middle" [attr.font-size]="el().style.fontSize" [attr.font-family]="el().style.fontFamily" [attr.fill]="el().style.color">{{ m.text }}</text>
          }
        }
      }
    </svg>
  `,
})
export class BarcodeViewComponent {
  readonly el = input.required<ReportElement>();
  readonly value = input('');
  readonly color = computed(() => this.el().barcode?.color || '#000000');
  readonly model = computed(() => {
    const el = this.el();
    const spec = el.barcode ?? { symbology: 'code128' as const, showText: true, color: '#000' };
    const res = encodeBarcode(spec.symbology, this.value());
    if (res.error) return { error: res.error, d: '', text: '', showText: false };
    const quiet = 10; // quiet zone in modules, each side
    const total = res.modules.length + quiet * 2;
    const mw = el.w / total;
    const textH = spec.showText ? el.style.fontSize + 4 : 0;
    const barH = Math.max(4, el.h - textH);
    let d = '';
    let i = 0;
    while (i < res.modules.length) {
      if (res.modules[i] !== '1') {
        i++;
        continue;
      }
      let j = i;
      while (j < res.modules.length && res.modules[j] === '1') j++;
      const x = +((quiet + i) * mw).toFixed(3);
      const bw = +((j - i) * mw).toFixed(3);
      d += `M${x},0h${bw}v${barH}h${-bw}Z`;
      i = j;
    }
    return { error: '', d, text: res.text, showText: spec.showText };
  });
}

/** QR code element: dark modules as one SVG path, centred, with a 4-module quiet zone. */
@Component({
  selector: 'rpt-qr-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'position:absolute;inset:0;display:block' },
  template: `
    <svg [attr.width]="el().w" [attr.height]="el().h" style="display:block">
      @if (model(); as m) {
        @if (m.error) {
          <text [attr.x]="el().w / 2" [attr.y]="el().h / 2" text-anchor="middle" font-size="11" fill="#c4372f">{{ m.error }}</text>
        } @else {
          <path [attr.d]="m.d" [attr.fill]="el().qr?.color || '#000000'" shape-rendering="crispEdges" />
        }
      }
    </svg>
  `,
})
export class QrViewComponent {
  readonly el = input.required<ReportElement>();
  readonly value = input('');
  readonly model = computed(() => {
    const el = this.el();
    const res = encodeQr(this.value(), el.qr?.errorCorrection ?? 'M');
    if (res.error) return { error: res.error, d: '' };
    const quiet = 4;
    const cell = Math.min(el.w, el.h) / (res.size + quiet * 2);
    const ox = (el.w - cell * res.size) / 2;
    const oy = (el.h - cell * res.size) / 2;
    const c3 = +cell.toFixed(3);
    let d = '';
    for (let r = 0; r < res.size; r++)
      for (let c = 0; c < res.size; c++)
        if (res.modules[r][c]) d += `M${+(ox + c * cell).toFixed(3)},${+(oy + r * cell).toFixed(3)}h${c3}v${c3}h${-c3}Z`;
    return { error: '', d };
  });
}
