import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { renderTemplate, type Row } from '../../engine/expressions';
import { crosstabAsTable } from '../../engine/crosstab';
import { DesignerStore } from '../designer.store';
import { BarcodeViewComponent, ChartViewComponent, QrViewComponent } from './graphics.components';
import { SafeImagePipe } from './safe-image.pipe';
import type { ReportElement } from '../../model/types';
import { LINE_HEIGHT } from '../../engine/measure';
import { css } from '../css';
import { TableViewComponent, designTableData, type TableRenderData } from './table-view.component';

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
const ALIGN_ITEMS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

/** Draws one report element. Used by both the designer canvas and the preview. */
@Component({
  selector: 'rpt-element',
  standalone: true,
  imports: [TableViewComponent, ChartViewComponent, BarcodeViewComponent, QrViewComponent, SafeImagePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style]': 'hostStyle()' },
  template: `
    @switch (el().kind) {
      @case ('table') {
        @if (el().table) {
          <rpt-table-view [el]="el()" [data]="tableData() ?? designData()" />
        }
      }
      @case ('crosstab') {
        @if (crosstab(); as x) {
          <rpt-table-view [el]="x.table" [data]="tableData() ?? x.render" />
        }
      }
      @case ('chart') {
        <rpt-chart-view [el]="el()" [rows]="chartRows()" />
      }
      @case ('barcode') {
        <rpt-barcode-view [el]="el()" [value]="codeValue()" />
      }
      @case ('qrcode') {
        <rpt-qr-view [el]="el()" [value]="codeValue()" />
      }
      @case ('line') {
        <div [style]="lineStyle()"></div>
      }
      @case ('rect') {}
      @case ('image') {
        @if (content()) {
          <img [src]="content() | safeImage" alt="" draggable="false" style="width:100%;height:100%;display:block" [style.object-fit]="el().imageFit ?? 'contain'" />
        } @else if (design()) {
          <div class="image-placeholder">Image</div>
        }
      }
      @default {
        <span style="width:100%">{{ content() }}</span>
      }
    }
    <ng-content />
  `,
})
export class ElementBoxComponent {
  readonly el = input.required<ReportElement>();
  readonly content = input('');
  readonly design = input(false);
  /** Overrides for grown/shifted elements in the preview. */
  readonly top = input<number | undefined>(undefined);
  readonly height = input<number | undefined>(undefined);
  /** Rows to draw for a table; omitted in the designer (templates are shown). */
  readonly tableData = input<TableRenderData | undefined>(undefined);

  /** Rows for a chart / cross table in the preview (its band's scope). */
  readonly rows = input<Row[] | undefined>(undefined);

  private readonly store = inject(DesignerStore);
  readonly designData = computed(() => designTableData(this.el()));

  /** In the designer, charts and cross tables show the loaded data. */
  readonly chartRows = computed(() => this.rows() ?? this.store.data().rows);
  readonly crosstab = computed(() => (this.el().crosstab ? crosstabAsTable(this.el(), this.chartRows()) : null));

  /** Barcode/QR value: the evaluated text in the preview; in the designer, evaluated on the first data row. */
  readonly codeValue = computed(() => {
    if (!this.design()) return this.content();
    const rows = this.store.data().rows;
    const ctx = { row: rows[0], rows, allRows: rows, pageRows: rows, rowNumber: 1, pageNumber: 1, totalPages: 1, reportName: this.store.report().name, params: this.store.params() };
    return renderTemplate(this.el().text, ctx, this.el().format);
  });

  readonly hostStyle = computed(() => {
    const el = this.el();
    const s = el.style;
    const box = {
      position: 'absolute',
      left: el.x,
      top: this.top() ?? el.y,
      width: el.w,
      height: this.height() ?? el.h,
      boxSizing: 'border-box',
    };
    if (el.kind === 'rect') {
      return css({ ...box, display: 'block', border: `${s.borderWidth}px ${el.dash ?? 'solid'} ${s.borderColor}`, background: s.background });
    }
    if (el.kind !== 'text' && el.kind !== 'field') return css({ ...box, display: 'block' });
    return css({
      ...box,
      display: 'flex',
      justifyContent: JUSTIFY[s.align],
      alignItems: ALIGN_ITEMS[s.vAlign],
      textAlign: s.align,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.bold ? 700 : 400,
      fontStyle: s.italic ? 'italic' : 'normal',
      textDecoration: s.underline ? 'underline' : 'none',
      color: s.color,
      background: s.background,
      padding: s.padding,
      overflow: 'hidden',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      lineHeight: LINE_HEIGHT,
      border: s.borderWidth > 0 ? `${s.borderWidth}px solid ${s.borderColor}` : undefined,
    });
  });

  readonly lineStyle = computed(() => {
    const el = this.el();
    const t = Math.max(1, el.style.borderWidth);
    const horizontal = el.w >= el.h;
    const stroke = `${t}px ${el.dash ?? 'solid'} ${el.style.borderColor}`;
    return css({
      position: 'absolute',
      ...(horizontal
        ? { left: 0, right: 0, top: `calc(50% - ${t / 2}px)`, height: 0, borderTop: stroke }
        : { top: 0, bottom: 0, left: `calc(50% - ${t / 2}px)`, width: 0, borderLeft: stroke }),
    });
  });
}
