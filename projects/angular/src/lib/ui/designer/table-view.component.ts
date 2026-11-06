import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ReportElement } from '../../model/types';
import { columnWidths, hasGrid, type TableRenderData } from '../../engine/table';
import { LINE_HEIGHT } from '../../engine/measure';
import { css } from '../css';

export type { TableRenderData };

/** Data for drawing a table in the designer: the column templates themselves. */
export function designTableData(el: ReportElement): TableRenderData {
  const t = el.table!;
  return {
    header: t.showHeader ? t.columns.map((c) => c.header) : null,
    headerHeight: t.headerHeight,
    rows: [{ cells: t.columns.map((c) => c.text), height: t.rowHeight, index: 0 }],
    footer: t.showFooter ? t.columns.map((c) => c.footer) : null,
    footerHeight: t.rowHeight,
  };
}

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
const ALIGN_ITEMS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

/** Draws the inside of a table element (fills its parent box). Shared by designer and preview. */
@Component({
  selector: 'rpt-table-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style]': 'hostStyle()' },
  template: `
    @if (data().header; as header) {
      <div [style]="headerRowStyle()">
        @for (h of header; track $index) {
          <div [style]="cellStyles()[$index]"><span style="width:100%">{{ h }}</span></div>
        }
      </div>
    }
    @for (r of data().rows; track r.index) {
      <div [style]="rowStyle(r.index, r.height)">
        @for (c of r.cells; track $index) {
          <div [style]="cellStyles()[$index]"><span style="width:100%">{{ c }}</span></div>
        }
      </div>
    }
    @if (data().footer; as footer) {
      <div [style]="footerRowStyle()">
        @for (f of footer; track $index) {
          <div [style]="cellStyles()[$index]"><span style="width:100%">{{ f }}</span></div>
        }
      </div>
    }
  `,
})
export class TableViewComponent {
  readonly el = input.required<ReportElement>();
  readonly data = input.required<TableRenderData>();

  private readonly line = computed(() => {
    const t = this.el().table!;
    return hasGrid(t) ? `1px solid ${t.gridColor}` : undefined;
  });

  readonly hostStyle = computed(() => {
    const s = this.el().style;
    return css({
      position: 'absolute',
      inset: 0,
      display: 'block',
      borderTop: this.line(),
      borderLeft: this.line(),
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.bold ? 700 : 400,
      fontStyle: s.italic ? 'italic' : 'normal',
      color: s.color,
      overflow: 'hidden',
    });
  });

  readonly cellStyles = computed(() => {
    const el = this.el();
    const t = el.table!;
    const widths = columnWidths(el);
    return t.columns.map((c, i) =>
      css({
        width: widths[i],
        flex: 'none',
        display: 'flex',
        justifyContent: JUSTIFY[c.align],
        alignItems: ALIGN_ITEMS[el.style.vAlign],
        textAlign: c.align,
        padding: el.style.padding,
        borderRight: this.line(),
        borderBottom: this.line(),
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        lineHeight: LINE_HEIGHT,
        boxSizing: 'border-box',
      }),
    );
  });

  readonly headerRowStyle = computed(() => {
    const t = this.el().table!;
    return css({ display: 'flex', height: this.data().headerHeight, background: t.headerBackground, color: t.headerColor, fontWeight: 700 });
  });

  readonly footerRowStyle = computed(() => {
    const t = this.el().table!;
    const border = hasGrid(t) ? t.gridColor : this.el().style.color;
    return css({ display: 'flex', height: this.data().footerHeight, fontWeight: 700, borderTop: `2px solid ${border}`, boxSizing: 'border-box' });
  });

  rowStyle(index: number, height: number): string {
    const t = this.el().table!;
    const bg = index % 2 === 1 && t.stripeBackground !== 'transparent' ? t.stripeBackground : this.el().style.background;
    return css({ display: 'flex', height, background: bg });
  }
}
