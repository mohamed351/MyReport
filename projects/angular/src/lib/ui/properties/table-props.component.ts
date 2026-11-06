import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExprInputComponent } from './expr-input.component';
import type { FormatKind, HAlign, ReportElement, TableColumn, TableSpec } from '../../model/types';
import { columnWidths, createColumn, designTableHeight } from '../../engine/table';
import { DesignerStore, findElement } from '../designer.store';

const FORMAT_KINDS: FormatKind[] = ['none', 'number', 'currency', 'percent', 'date', 'datetime', 'time'];
type ColorKey = 'headerBackground' | 'stripeBackground' | 'gridColor' | 'headerColor';

@Component({
  selector: 'rpt-table-props',
  standalone: true,
  imports: [FormsModule, ExprInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = spec();
    <section>
      <h4>Table</h4>
      <label class="check">
        <input type="checkbox" [ngModel]="t.showHeader" (ngModelChange)="set(flag('showHeader', $event))" /> Header row
      </label>
      <label class="check">
        <input type="checkbox" [ngModel]="t.repeatHeader" (ngModelChange)="set(flag('repeatHeader', $event))" /> Repeat header on each page
      </label>
      <label class="check">
        <input type="checkbox" [ngModel]="t.showFooter" (ngModelChange)="set(flag('showFooter', $event))" /> Footer (totals) row
      </label>
      <div class="grid2">
        <label class="prop-row"><span>Header h</span>
          <div class="prop-value"><input type="number" min="8" [ngModel]="t.headerHeight" (ngModelChange)="height('headerHeight', $event)" /></div>
        </label>
        <label class="prop-row"><span>Row h</span>
          <div class="prop-value"><input type="number" min="8" [ngModel]="t.rowHeight" (ngModelChange)="height('rowHeight', $event)" /></div>
        </label>
      </div>
      <div class="prop-row"><span>Header fill</span>
        <div class="prop-value">
          <input type="color" [ngModel]="colorValue(t.headerBackground)" (ngModelChange)="set(color('headerBackground', $event))" />
          <button class="small" [class.on]="t.headerBackground === 'transparent'" (click)="set(color('headerBackground', 'transparent'))">None</button>
        </div>
      </div>
      <div class="prop-row"><span>Header text</span>
        <div class="prop-value"><input type="color" [ngModel]="t.headerColor" (ngModelChange)="set(color('headerColor', $event))" /></div>
      </div>
      <div class="prop-row"><span>Row fill</span>
        <div class="prop-value">
          <input type="color" [ngModel]="colorValue(el().style.background)" (ngModelChange)="set(rowFill($event))" />
          <button class="small" [class.on]="el().style.background === 'transparent'" (click)="set(rowFill('transparent'))">None</button>
        </div>
      </div>
      <div class="prop-row"><span>Alt. row</span>
        <div class="prop-value">
          <input type="color" [ngModel]="colorValue(t.stripeBackground)" (ngModelChange)="set(color('stripeBackground', $event))" />
          <button class="small" [class.on]="t.stripeBackground === 'transparent'" (click)="set(color('stripeBackground', 'transparent'))">None</button>
        </div>
      </div>
      <div class="prop-row"><span>Grid lines</span>
        <div class="prop-value">
          <input type="color" [ngModel]="colorValue(t.gridColor)" (ngModelChange)="set(color('gridColor', $event))" />
          <button class="small" [class.on]="t.gridColor === 'transparent'" (click)="set(color('gridColor', 'transparent'))">None</button>
        </div>
      </div>
      <p class="hint">
        Lists the rows of its band: all rows in Report Header/Footer, the group's rows in Group bands. It continues onto new pages
        automatically. Drop a field on the table to add a column.
      </p>
    </section>

    <section>
      <h4>Columns</h4>
      @for (c of t.columns; track c.id; let i = $index, last = $last) {
        <div class="col-card">
          <div class="col-head">
            <strong>{{ i + 1 }}</strong>
            <span class="muted">{{ widths()[i] }}px</span>
            <span class="spacer"></span>
            <button class="small" [disabled]="i === 0" title="Move left" (click)="moveColumn(i, -1)">←</button>
            <button class="small" [disabled]="last" title="Move right" (click)="moveColumn(i, 1)">→</button>
            <button class="small danger" title="Remove column" (click)="removeColumn(i)">✕</button>
          </div>
          <label class="prop-row"><span>Header</span>
            <div class="prop-value"><input [ngModel]="c.header" (ngModelChange)="col(i, setHeader($event))" /></div>
          </label>
          <label class="prop-row"><span>Cell</span>
            <div class="prop-value"><rpt-expr-input [value]="c.text" placeholder="{Field}" (valueChange)="col(i, setCell($event))" /></div>
          </label>
          @if (t.showFooter) {
            <label class="prop-row"><span>Footer</span>
              <div class="prop-value"><rpt-expr-input [value]="c.footer" placeholder="{sum(Amount)}" (valueChange)="col(i, setFooter($event))" /></div>
            </label>
          }
          <div class="grid2">
            <label class="prop-row"><span>Width</span>
              <div class="prop-value">
                <input type="number" min="0.1" step="0.1" [ngModel]="c.width" (ngModelChange)="colWidth(i, $event)" />
              </div>
            </label>
            <label class="prop-row"><span>Align</span>
              <div class="prop-value">
                <select [ngModel]="c.align" (ngModelChange)="col(i, setAlign($event))">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </label>
          </div>
          <div class="grid2">
            <label class="prop-row"><span>Format</span>
              <div class="prop-value">
                <select [ngModel]="c.format.kind" (ngModelChange)="col(i, setFormat($event))">
                  @for (k of formatKinds; track k) {
                    <option [value]="k">{{ k }}</option>
                  }
                </select>
              </div>
            </label>
            @if (c.format.kind === 'number' || c.format.kind === 'currency' || c.format.kind === 'percent') {
              <label class="prop-row"><span>Decimals</span>
                <div class="prop-value">
                  <input type="number" min="0" [ngModel]="c.format.decimals" (ngModelChange)="colDecimals(i, $event)" />
                </div>
              </label>
            }
          </div>
        </div>
      }
      <button (click)="addColumn()">+ Add column</button>
    </section>
  `,
})
export class TablePropsComponent {
  private readonly store = inject(DesignerStore);
  readonly el = input.required<ReportElement>();

  protected readonly formatKinds = FORMAT_KINDS;
  protected readonly spec = computed(() => this.el().table!);
  protected readonly widths = computed(() => columnWidths(this.el()).map((w) => Math.round(w)));

  /** Edits the table and keeps the element height in sync with its header/row/footer heights. */
  protected set(fn: (t: TableSpec, e: ReportElement) => void): void {
    const id = this.el().id;
    this.store.update((r) => {
      const f = findElement(r, id);
      if (!f?.el.table) return;
      fn(f.el.table, f.el);
      f.el.h = designTableHeight(f.el.table);
      f.band.height = Math.max(f.band.height, f.el.y + f.el.h);
    });
  }

  protected col(i: number, fn: (c: TableColumn) => void): void {
    this.set((t) => t.columns[i] && fn(t.columns[i]));
  }

  protected colorValue(v: string): string {
    return !v || v === 'transparent' ? '#ffffff' : v;
  }

  protected flag = (k: 'showHeader' | 'repeatHeader' | 'showFooter', v: boolean) => (t: TableSpec) => (t[k] = v);
  protected color = (k: ColorKey, v: string) => (t: TableSpec) => (t[k] = v);
  protected rowFill = (v: string) => (_: TableSpec, e: ReportElement) => (e.style.background = v);
  protected setHeader = (v: string) => (c: TableColumn) => (c.header = v);
  protected setCell = (v: string) => (c: TableColumn) => (c.text = v);
  protected setFooter = (v: string) => (c: TableColumn) => (c.footer = v);
  protected setAlign = (v: HAlign) => (c: TableColumn) => (c.align = v);
  protected setFormat = (v: FormatKind) => (c: TableColumn) => (c.format.kind = v);

  protected height(k: 'headerHeight' | 'rowHeight', v: number | null): void {
    if (v != null && Number.isFinite(v)) this.set((t) => (t[k] = Math.max(8, v)));
  }

  protected colWidth(i: number, v: number | null): void {
    if (v != null && Number.isFinite(v)) this.col(i, (c) => (c.width = Math.max(0.1, v)));
  }

  protected colDecimals(i: number, v: number | null): void {
    if (v != null && Number.isFinite(v)) this.col(i, (c) => (c.format.decimals = Math.max(0, Math.min(10, v))));
  }

  protected moveColumn(i: number, d: number): void {
    this.set((t) => {
      const j = i + d;
      if (j < 0 || j >= t.columns.length) return;
      [t.columns[i], t.columns[j]] = [t.columns[j], t.columns[i]];
    });
  }

  protected removeColumn(i: number): void {
    this.set((t) => t.columns.splice(i, 1));
  }

  protected addColumn(): void {
    this.set((t) => t.columns.push(createColumn('')));
  }
}
