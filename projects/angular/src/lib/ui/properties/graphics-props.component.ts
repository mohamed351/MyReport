import { ChangeDetectionStrategy, Component, Directive, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AggregateKind, ChartType, FormatKind, ReportElement } from '../../model/types';
import { MAX_SERIES } from '../../engine/chart';
import { DesignerStore, findElement } from '../designer.store';

const AGGREGATES: AggregateKind[] = ['sum', 'count', 'avg', 'min', 'max'];
const VALUE_FORMATS: FormatKind[] = ['none', 'number', 'currency', 'percent'];

/** Base: edits one element in place by id (one undo step per change). */
@Directive()
abstract class SpecEditor {
  protected readonly store = inject(DesignerStore);
  readonly el = input.required<ReportElement>();
  protected readonly aggregates = AGGREGATES;
  protected readonly valueFormats = VALUE_FORMATS;

  protected edit(fn: (e: ReportElement) => void): void {
    const id = this.el().id;
    this.store.update((r) => {
      const f = findElement(r, id);
      if (f) fn(f.el);
    });
  }

  protected positive(v: number | null, fn: (n: number) => void): void {
    if (v != null && Number.isFinite(v)) fn(Math.max(0, v));
  }
}

@Component({
  selector: 'rpt-chart-props',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = el().chart!;
    <section>
      <h4>Chart</h4>
      <div class="btn-group">
        @for (t of types; track t.value) {
          <button [class.on]="c.type === t.value" [title]="t.label" (click)="edit(set('type', t.value))">{{ t.icon }} {{ t.label }}</button>
        }
      </div>
      <label class="prop-row"><span>Title</span>
        <div class="prop-value"><input [ngModel]="c.title" placeholder="e.g. Sales in {Country}" (ngModelChange)="edit(set('title', $event))" /></div>
      </label>
      <label class="prop-row"><span>Category</span>
        <div class="prop-value"><input list="field-names" [ngModel]="c.categoryField" placeholder="Field" (ngModelChange)="edit(set('categoryField', $event))" /></div>
      </label>
      <label class="prop-row"><span>{{ pie() ? 'Value' : 'Values' }}</span>
        <div class="prop-value">
          <input list="field-names" [ngModel]="c.valueFields.join(', ')" [placeholder]="pie() ? 'Field' : 'Field, Field…'" (ngModelChange)="setValues($event)" />
        </div>
      </label>
      <label class="prop-row"><span>Aggregate</span>
        <div class="prop-value">
          <select [ngModel]="c.aggregate" (ngModelChange)="edit(set('aggregate', $event))">
            @for (a of aggregates; track a) { <option [value]="a">{{ a }}</option> }
          </select>
        </div>
      </label>
      <label class="prop-row"><span>Sort</span>
        <div class="prop-value">
          <select [ngModel]="c.sort" (ngModelChange)="edit(set('sort', $event))">
            <option value="none">Data order</option>
            <option value="category">By category</option>
            <option value="valueDesc">Value, high → low</option>
            <option value="valueAsc">Value, low → high</option>
          </select>
        </div>
      </label>
      <label class="prop-row"><span>Max items</span>
        <div class="prop-value"><input type="number" min="1" [ngModel]="c.maxCategories" (ngModelChange)="positive($event, setMax)" /></div>
      </label>
      <label class="prop-row"><span>Value format</span>
        <div class="prop-value">
          <select [ngModel]="c.valueFormat.kind" (ngModelChange)="edit(setFormat($event))">
            @for (k of valueFormats; track k) { <option [value]="k">{{ k }}</option> }
          </select>
        </div>
      </label>
      <label class="check"><input type="checkbox" [ngModel]="c.showLegend" (ngModelChange)="edit(set('showLegend', $event))" /> Legend</label>
      <label class="check"><input type="checkbox" [ngModel]="c.showValues" (ngModelChange)="edit(set('showValues', $event))" /> Value labels</label>
      @if (!pie()) {
        <label class="check"><input type="checkbox" [ngModel]="c.showGrid" (ngModelChange)="edit(set('showGrid', $event))" /> Grid lines</label>
      }
      <p class="hint">
        Charts the rows of its band: all rows in Report Header/Footer, the group's rows in a Group band.
        @if (pie()) { Pie slices beyond {{ maxSeries }} fold into "Other". } @else { Up to {{ maxSeries }} value fields (one colour each). }
      </p>
    </section>
  `,
})
export class ChartPropsComponent extends SpecEditor {
  protected readonly maxSeries = MAX_SERIES;
  protected readonly types: { value: ChartType; label: string; icon: string }[] = [
    { value: 'bar', label: 'Bar', icon: '▮' },
    { value: 'hbar', label: 'H-bar', icon: '▬' },
    { value: 'line', label: 'Line', icon: '⟋' },
    { value: 'area', label: 'Area', icon: '◭' },
    { value: 'pie', label: 'Pie', icon: '◔' },
    { value: 'doughnut', label: 'Doughnut', icon: '◯' },
  ];
  protected readonly pie = computed(() => this.el().chart?.type === 'pie' || this.el().chart?.type === 'doughnut');
  protected set = <K extends keyof NonNullable<ReportElement['chart']>>(k: K, v: NonNullable<ReportElement['chart']>[K]) => (e: ReportElement) =>
    (e.chart![k] = v);
  protected setMax = (n: number) => this.edit((e) => (e.chart!.maxCategories = Math.max(1, Math.round(n))));
  protected setFormat = (k: FormatKind) => (e: ReportElement) => (e.chart!.valueFormat.kind = k);
  protected setValues(v: string): void {
    const fields = v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_SERIES);
    this.edit((e) => (e.chart!.valueFields = fields));
  }
}

@Component({
  selector: 'rpt-barcode-props',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = el().barcode!;
    <section>
      <h4>Barcode</h4>
      <label class="prop-row"><span>Type</span>
        <div class="prop-value">
          <select [ngModel]="b.symbology" (ngModelChange)="edit(setType($event))">
            <option value="code128">Code 128 (any text)</option>
            <option value="ean13">EAN-13 (12–13 digits)</option>
          </select>
        </div>
      </label>
      <label class="check"><input type="checkbox" [ngModel]="b.showText" (ngModelChange)="edit(setShowText($event))" /> Show text under bars</label>
      <label class="prop-row"><span>Bar color</span>
        <div class="prop-value"><input type="color" [ngModel]="b.color" (ngModelChange)="edit(setColor($event))" /></div>
      </label>
      <p class="hint">Keep bars dark on a light background for reliable scanning. EAN-13 adds the check digit when you give 12 digits.</p>
    </section>
  `,
})
export class BarcodePropsComponent extends SpecEditor {
  protected setType = (v: 'code128' | 'ean13') => (e: ReportElement) => (e.barcode!.symbology = v);
  protected setShowText = (v: boolean) => (e: ReportElement) => (e.barcode!.showText = v);
  protected setColor = (v: string) => (e: ReportElement) => (e.barcode!.color = v);
}

@Component({
  selector: 'rpt-qr-props',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let q = el().qr!;
    <section>
      <h4>QR code</h4>
      <label class="prop-row"><span>Error level</span>
        <div class="prop-value">
          <select [ngModel]="q.errorCorrection" (ngModelChange)="edit(setLevel($event))">
            <option value="L">L — 7% (smallest)</option>
            <option value="M">M — 15%</option>
            <option value="Q">Q — 25%</option>
            <option value="H">H — 30% (most robust)</option>
          </select>
        </div>
      </label>
      <label class="prop-row"><span>Color</span>
        <div class="prop-value"><input type="color" [ngModel]="q.color" (ngModelChange)="edit(setColor($event))" /></div>
      </label>
    </section>
  `,
})
export class QrPropsComponent extends SpecEditor {
  protected setLevel = (v: 'L' | 'M' | 'Q' | 'H') => (e: ReportElement) => (e.qr!.errorCorrection = v);
  protected setColor = (v: string) => (e: ReportElement) => (e.qr!.color = v);
}

@Component({
  selector: 'rpt-crosstab-props',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let x = el().crosstab!;
    <section>
      <h4>Cross table</h4>
      <label class="prop-row"><span>Rows</span>
        <div class="prop-value"><input list="field-names" [ngModel]="x.rowField" placeholder="Field" (ngModelChange)="edit(set('rowField', $event))" /></div>
      </label>
      <label class="prop-row"><span>Columns</span>
        <div class="prop-value"><input list="field-names" [ngModel]="x.columnField" placeholder="Field" (ngModelChange)="edit(set('columnField', $event))" /></div>
      </label>
      <label class="prop-row"><span>Value</span>
        <div class="prop-value"><input list="field-names" [ngModel]="x.valueField" placeholder="Field (empty = count)" (ngModelChange)="edit(set('valueField', $event))" /></div>
      </label>
      <label class="prop-row"><span>Aggregate</span>
        <div class="prop-value">
          <select [ngModel]="x.aggregate" (ngModelChange)="edit(set('aggregate', $event))">
            @for (a of aggregates; track a) { <option [value]="a">{{ a }}</option> }
          </select>
        </div>
      </label>
      <div class="grid2">
        <label class="prop-row"><span>Format</span>
          <div class="prop-value">
            <select [ngModel]="x.valueFormat.kind" (ngModelChange)="edit(setFormat($event))">
              @for (k of valueFormats; track k) { <option [value]="k">{{ k }}</option> }
            </select>
          </div>
        </label>
        <label class="prop-row"><span>Decimals</span>
          <div class="prop-value"><input type="number" min="0" [ngModel]="x.valueFormat.decimals" (ngModelChange)="positive($event, setDecimals)" /></div>
        </label>
      </div>
      <label class="prop-row"><span>Corner text</span>
        <div class="prop-value"><input [ngModel]="x.cornerText" placeholder="Rows / Columns" (ngModelChange)="edit(set('cornerText', $event))" /></div>
      </label>
      <label class="check"><input type="checkbox" [ngModel]="x.showRowTotals" (ngModelChange)="edit(set('showRowTotals', $event))" /> Row totals (right column)</label>
      <label class="check"><input type="checkbox" [ngModel]="x.showColumnTotals" (ngModelChange)="edit(set('showColumnTotals', $event))" /> Column totals (bottom row)</label>
      <label class="check"><input type="checkbox" [ngModel]="x.repeatHeader" (ngModelChange)="edit(set('repeatHeader', $event))" /> Repeat header on each page</label>
    </section>
    <section>
      <h4>Look</h4>
      <div class="grid2">
        <label class="prop-row"><span>Header h</span>
          <div class="prop-value"><input type="number" min="8" [ngModel]="x.headerHeight" (ngModelChange)="positive($event, setHeaderH)" /></div>
        </label>
        <label class="prop-row"><span>Row h</span>
          <div class="prop-value"><input type="number" min="8" [ngModel]="x.rowHeight" (ngModelChange)="positive($event, setRowH)" /></div>
        </label>
      </div>
      <div class="prop-row"><span>Header fill</span>
        <div class="prop-value"><input type="color" [ngModel]="x.headerBackground" (ngModelChange)="edit(set('headerBackground', $event))" /></div>
      </div>
      <div class="prop-row"><span>Header text</span>
        <div class="prop-value"><input type="color" [ngModel]="x.headerColor" (ngModelChange)="edit(set('headerColor', $event))" /></div>
      </div>
      <div class="prop-row"><span>Alt. row</span>
        <div class="prop-value">
          <input type="color" [ngModel]="x.stripeBackground === 'transparent' ? '#ffffff' : x.stripeBackground" (ngModelChange)="edit(set('stripeBackground', $event))" />
          <button class="small" [class.on]="x.stripeBackground === 'transparent'" (click)="edit(set('stripeBackground', 'transparent'))">None</button>
        </div>
      </div>
      <div class="prop-row"><span>Grid lines</span>
        <div class="prop-value">
          <input type="color" [ngModel]="x.gridColor === 'transparent' ? '#ffffff' : x.gridColor" (ngModelChange)="edit(set('gridColor', $event))" />
          <button class="small" [class.on]="x.gridColor === 'transparent'" (click)="edit(set('gridColor', 'transparent'))">None</button>
        </div>
      </div>
      <p class="hint">Pivots the rows of its band. It grows to fit and continues onto new pages in the preview.</p>
    </section>
  `,
})
export class CrosstabPropsComponent extends SpecEditor {
  protected set = <K extends keyof NonNullable<ReportElement['crosstab']>>(k: K, v: NonNullable<ReportElement['crosstab']>[K]) => (e: ReportElement) =>
    (e.crosstab![k] = v);
  protected setFormat = (k: FormatKind) => (e: ReportElement) => (e.crosstab!.valueFormat.kind = k);
  protected setDecimals = (n: number) => this.edit((e) => (e.crosstab!.valueFormat.decimals = Math.min(10, Math.round(n))));
  protected setHeaderH = (n: number) => this.edit((e) => (e.crosstab!.headerHeight = Math.max(8, n)));
  protected setRowH = (n: number) => this.edit((e) => (e.crosstab!.rowHeight = Math.max(8, n)));
}
