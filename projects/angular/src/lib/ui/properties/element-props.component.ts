import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ElementStyle, FormatKind, ReportElement, StyleRule } from '../../model/types';
import { contentWidth, defaultFieldOptions } from '../../model/defaults';
import { AGGREGATES } from '../../engine/expressions';
import { DesignerStore } from '../designer.store';
import { TablePropsComponent } from './table-props.component';
import { ExprInputComponent } from './expr-input.component';
import { ImagePickerComponent } from './image-picker.component';
import { BarcodePropsComponent, ChartPropsComponent, CrosstabPropsComponent, QrPropsComponent } from './graphics-props.component';

export const FORMAT_KINDS: FormatKind[] = ['none', 'number', 'currency', 'percent', 'date', 'datetime', 'time'];
const NUMERIC_FORMATS = ['number', 'currency', 'percent'];

@Component({
  selector: 'rpt-element-props',
  standalone: true,
  imports: [FormsModule, ExprInputComponent, ImagePickerComponent, TablePropsComponent, ChartPropsComponent, BarcodePropsComponent, QrPropsComponent, CrosstabPropsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = el();
    @let s = e.style;
    <h3>
      {{ title() }}
      @if (count() > 1) {
        <span class="muted">({{ count() }} selected)</span>
      }
    </h3>

    @if (e.kind === 'image') {
      <section>
        <h4>Image</h4>
        <rpt-image-picker [value]="e.text" (valueChange)="set(setText($event))" />
        <label class="prop-row"><span>Fit</span>
          <div class="prop-value">
            <select [ngModel]="e.imageFit ?? 'contain'" (ngModelChange)="set(setFit($event))">
              <option value="contain">Contain (whole image)</option>
              <option value="cover">Cover (fill, crop)</option>
              <option value="fill">Stretch</option>
            </select>
          </div>
        </label>
      </section>
    }
    @if (isText() || isCode()) {
      <section>
        <div class="prop-label">{{ isCode() ? 'Value' : 'Text' }} <span class="muted">— type {{ '{' }} for fields &amp; formulas, Ctrl+Space for suggestions</span></div>
        <rpt-expr-input [value]="e.text" [rows]="3" (valueChange)="set(setText($event))" />
        @if (isCode()) {
          <p class="hint">Use fields, e.g. <code>{{ '{' }}OrderID{{ '}' }}</code>. The designer shows the first data row.</p>
        }
        @if (isText()) {
          <p class="hint">
            e.g. <code>{{ '{' }}Quantity * UnitPrice{{ '}' }}</code>, <code>{{ '{' }}sum(Amount, report){{ '}' }}</code>,
            <code>{{ '{' }}iif(Amount &gt; 100, "High", "Low"){{ '}' }}</code>, <code>{{ '{' }}upper(Customer){{ '}' }}</code>,
            <code>{{ '{' }}&#64;Country{{ '}' }}</code> (parameter). Outside Detail, a field shows the first record of its band.
          </p>
        }
      </section>
    }

    <section>
      <h4>Layout</h4>
      <div class="grid2">
        <label class="prop-row"><span>X</span>
          <div class="prop-value"><input type="number" min="0" [ngModel]="e.x" (ngModelChange)="num($event, setX)" /></div>
        </label>
        <label class="prop-row"><span>Y</span>
          <div class="prop-value"><input type="number" min="0" [ngModel]="e.y" (ngModelChange)="num($event, setY)" /></div>
        </label>
        <label class="prop-row"><span>Width</span>
          <div class="prop-value"><input type="number" min="1" [ngModel]="e.w" (ngModelChange)="num($event, setW)" /></div>
        </label>
        <label class="prop-row"><span>Height</span>
          <div class="prop-value">
            @if (isTable()) {
              <span class="muted">{{ e.h }} (auto)</span>
            } @else {
              <input type="number" min="1" [ngModel]="e.h" (ngModelChange)="num($event, setH)" />
            }
          </div>
        </label>
      </div>
      @if (isText() || isTable()) {
        <label class="check" title="Grow taller to fit long text; elements below are pushed down">
          <input type="checkbox" [ngModel]="e.canGrow !== false" (ngModelChange)="set(setGrow($event))" />
          Can grow (fit long text)
        </label>
      }
    </section>

    @if (isTable()) {
      <rpt-table-props [el]="e" />
    }
    @switch (e.kind) {
      @case ('chart') { @if (e.chart) { <rpt-chart-props [el]="e" /> } }
      @case ('barcode') { @if (e.barcode) { <rpt-barcode-props [el]="e" /> } }
      @case ('qrcode') { @if (e.qr) { <rpt-qr-props [el]="e" /> } }
      @case ('crosstab') { @if (e.crosstab) { <rpt-crosstab-props [el]="e" /> } }
    }

    @if (isText()) {
      <section>
        <h4>Format</h4>
        <label class="prop-row"><span>Type</span>
          <div class="prop-value">
            <select [ngModel]="e.format.kind" (ngModelChange)="set(setFormatKind($event))">
              @for (k of formatKinds; track k) {
                <option [value]="k">{{ k }}</option>
              }
            </select>
          </div>
        </label>
        @if (numericFormats.includes(e.format.kind)) {
          <label class="prop-row"><span>Decimals</span>
            <div class="prop-value"><input type="number" min="0" [ngModel]="e.format.decimals" (ngModelChange)="num($event, setDecimals)" /></div>
          </label>
        }
        @if (e.format.kind === 'currency') {
          <label class="prop-row"><span>Currency</span>
            <div class="prop-value"><input maxlength="3" [ngModel]="e.format.currency" (ngModelChange)="set(setCurrency($event))" /></div>
          </label>
        }
      </section>
    }

    @if (isText()) {
      @let o = options();
      <section>
        <h4>Field options</h4>
        <div class="prop-label">Text when empty</div>
        <rpt-expr-input [value]="o.nullText" placeholder="e.g. —  or  n/a" (valueChange)="setNullText($event)" />
        <label class="check" title="Leave the box empty when the value is the same as in the row above (restarts on each page)">
          <input type="checkbox" [ngModel]="o.hideDuplicates" (ngModelChange)="setHideDuplicates($event)" /> Hide repeated values
        </label>
        <div class="prop-label">Conditional formatting <span class="muted">— first matching rule wins</span></div>
        @for (r of o.rules; track $index; let i = $index) {
          <div class="col-card">
            <div class="col-head">
              <strong>When</strong><span class="spacer"></span>
              <button class="small danger" title="Remove rule" (click)="removeRule(i)">✕</button>
            </div>
            <rpt-expr-input mode="expression" [value]="r.when" placeholder="e.g. Amount > 1000" (valueChange)="setRule(i, 'when', $event)" />
            <div class="prop-row"><span>Text color</span>
              <div class="prop-value">
                <input type="color" [ngModel]="r.color" (ngModelChange)="setRule(i, 'color', $event)" />
                <label class="check"><input type="checkbox" [ngModel]="r.bold" (ngModelChange)="setRule(i, 'bold', $event)" /> Bold</label>
              </div>
            </div>
            <div class="prop-row"><span>Fill</span>
              <div class="prop-value">
                <input type="color" [ngModel]="r.background || '#ffffff'" (ngModelChange)="setRule(i, 'background', $event)" />
                <button class="small" [class.on]="!r.background" (click)="setRule(i, 'background', '')">None</button>
              </div>
            </div>
          </div>
        }
        <button (click)="addRule()">+ Add rule</button>
      </section>
    }

    <section>
      <h4>Visibility</h4>
      <div class="prop-label">Visible when <span class="muted">— empty = always</span></div>
      <rpt-expr-input mode="expression" [value]="e.visibleWhen ?? ''" placeholder="e.g. Amount > 0  or  @ShowDetails" (valueChange)="set(setVisible($event))" />
    </section>

    @if (isText() || isTable() || hasFont()) {
      <section>
        <h4>Font</h4>
        <label class="prop-row"><span>Family</span>
          <div class="prop-value">
            <select [ngModel]="s.fontFamily" (ngModelChange)="style('fontFamily', $event)">
              <option value="Segoe UI, Arial, sans-serif">Sans-serif</option>
              <option value="Georgia, 'Times New Roman', serif">Serif</option>
              <option value="Consolas, 'Courier New', monospace">Monospace</option>
              <option value="Tahoma, Arial, sans-serif">Tahoma (Arabic)</option>
            </select>
          </div>
        </label>
        <label class="prop-row"><span>Size</span>
          <div class="prop-value"><input type="number" min="4" [ngModel]="s.fontSize" (ngModelChange)="numStyle('fontSize', $event)" /></div>
        </label>
        <div class="btn-group">
          <button [class.on]="s.bold" (click)="style('bold', !s.bold)"><b>B</b></button>
          <button [class.on]="s.italic" (click)="style('italic', !s.italic)"><i>I</i></button>
          <button [class.on]="s.underline" (click)="style('underline', !s.underline)"><u>U</u></button>
          @if (isText()) {
            <span class="sep"></span>
            <button [class.on]="s.align === 'left'" (click)="style('align', 'left')" title="Align left">⇤</button>
            <button [class.on]="s.align === 'center'" (click)="style('align', 'center')" title="Align center">↔</button>
            <button [class.on]="s.align === 'right'" (click)="style('align', 'right')" title="Align right">⇥</button>
          }
          <span class="sep"></span>
          <button [class.on]="s.vAlign === 'top'" (click)="style('vAlign', 'top')" title="Vertical top">⤒</button>
          <button [class.on]="s.vAlign === 'middle'" (click)="style('vAlign', 'middle')" title="Vertical middle">↕</button>
          <button [class.on]="s.vAlign === 'bottom'" (click)="style('vAlign', 'bottom')" title="Vertical bottom">⤓</button>
        </div>
        <label class="prop-row"><span>Color</span>
          <div class="prop-value"><input type="color" [ngModel]="s.color" (ngModelChange)="style('color', $event)" /></div>
        </label>
        <label class="prop-row"><span>Padding</span>
          <div class="prop-value"><input type="number" min="0" [ngModel]="s.padding" (ngModelChange)="numStyle('padding', $event)" /></div>
        </label>
      </section>
    }

    @if (!isTable() && e.kind !== 'crosstab') {
      <section>
        <h4>{{ e.kind === 'line' ? 'Line' : 'Border & fill' }}</h4>
        @if (e.kind !== 'line' && e.kind !== 'image') {
          <div class="prop-row"><span>Background</span>
            <div class="prop-value">
              <input type="color" [ngModel]="s.background === 'transparent' ? '#ffffff' : s.background" (ngModelChange)="style('background', $event)" />
              <button class="small" [class.on]="s.background === 'transparent'" (click)="style('background', 'transparent')">None</button>
            </div>
          </div>
        }
        @if (e.kind === 'line' || e.kind === 'rect') {
          <label class="prop-row"><span>Style</span>
            <div class="prop-value">
              <select [ngModel]="e.dash ?? 'solid'" (ngModelChange)="set(setDash($event))">
                <option value="solid">Solid ───</option>
                <option value="dashed">Dashed - - -</option>
                <option value="dotted">Dotted ·····</option>
              </select>
            </div>
          </label>
        }
        <label class="prop-row"><span>{{ e.kind === 'line' ? 'Thickness' : 'Border width' }}</span>
          <div class="prop-value"><input type="number" min="0" [ngModel]="s.borderWidth" (ngModelChange)="numStyle('borderWidth', $event)" /></div>
        </label>
        <label class="prop-row"><span>{{ e.kind === 'line' ? 'Color' : 'Border color' }}</span>
          <div class="prop-value"><input type="color" [ngModel]="s.borderColor" (ngModelChange)="style('borderColor', $event)" /></div>
        </label>
      </section>
    }
  `,
})
export class ElementPropsComponent {
  private readonly store = inject(DesignerStore);
  readonly el = input.required<ReportElement>();
  readonly count = input(1);

  protected readonly formatKinds = FORMAT_KINDS;
  protected readonly numericFormats = NUMERIC_FORMATS;
  protected readonly aggregates = AGGREGATES.join(', ');
  protected readonly isText = computed(() => this.el().kind === 'text' || this.el().kind === 'field');
  protected readonly isTable = computed(() => this.el().kind === 'table' && !!this.el().table);
  protected readonly isCode = computed(() => this.el().kind === 'barcode' || this.el().kind === 'qrcode');
  /** Elements that draw text with the element font (beyond labels/fields/tables). */
  protected readonly hasFont = computed(() => ['chart', 'crosstab', 'barcode'].includes(this.el().kind));
  protected readonly title = computed(() => {
    const k = this.el().kind;
    return k === 'field' ? 'Field' : k[0].toUpperCase() + k.slice(1);
  });

  private readonly width = computed(() => contentWidth(this.store.report().page));

  // Setters (applied to every selected element).
  protected readonly setX = (v: number) => (e: ReportElement) => (e.x = Math.max(0, Math.min(v, this.width() - e.w)));
  protected readonly setY = (v: number) => (e: ReportElement) => (e.y = Math.max(0, v));
  protected readonly setW = (v: number) => (e: ReportElement) => (e.w = Math.max(1, v));
  protected readonly setH = (v: number) => (e: ReportElement) => (e.h = Math.max(1, v));
  protected readonly setDecimals = (v: number) => (e: ReportElement) => (e.format.decimals = Math.max(0, Math.min(10, v)));
  protected setText = (v: string) => (e: ReportElement) => (e.text = v);
  protected setDash = (v: 'solid' | 'dashed' | 'dotted') => (e: ReportElement) => (e.dash = v === 'solid' ? undefined : v);
  protected setFit = (v: 'contain' | 'cover' | 'fill') => (e: ReportElement) => (e.imageFit = v);
  protected setVisible = (v: string) => (e: ReportElement) => (e.visibleWhen = v || undefined);
  protected setGrow = (v: boolean) => (e: ReportElement) => (e.canGrow = v);
  protected setFormatKind = (v: FormatKind) => (e: ReportElement) => (e.format.kind = v);
  protected setCurrency = (v: string) => (e: ReportElement) => (e.format.currency = v.toUpperCase());

  protected readonly options = computed(() => ({ ...defaultFieldOptions(), ...this.el().fieldOptions }));

  protected setNullText(v: string): void {
    this.set((e) => (e.fieldOptions = { ...defaultFieldOptions(), ...e.fieldOptions, nullText: v }));
  }

  protected setHideDuplicates(v: boolean): void {
    this.set((e) => (e.fieldOptions = { ...defaultFieldOptions(), ...e.fieldOptions, hideDuplicates: v }));
  }

  protected addRule(): void {
    this.set((e) => {
      const o = { ...defaultFieldOptions(), ...e.fieldOptions };
      e.fieldOptions = { ...o, rules: [...o.rules, { when: '', color: '#c4372f', background: '', bold: true }] };
    });
  }

  protected setRule<K extends keyof StyleRule>(i: number, k: K, v: StyleRule[K]): void {
    this.set((e) => {
      const r = e.fieldOptions?.rules[i];
      if (r) r[k] = v;
    });
  }

  protected removeRule(i: number): void {
    this.set((e) => e.fieldOptions?.rules.splice(i, 1));
  }

  protected set(fn: (e: ReportElement) => void): void {
    const ids = this.store.selection().elementIds;
    this.store.update((r) => {
      for (const b of r.bands)
        for (const e of b.elements)
          if (ids.includes(e.id)) {
            fn(e);
            // Keep the element inside its band: grow the band to fit a new Y/height.
            b.height = Math.max(b.height, e.y + e.h);
          }
    });
  }

  protected num(v: number | null, setter: (v: number) => (e: ReportElement) => void): void {
    if (v != null && Number.isFinite(v)) this.set(setter(v));
  }

  protected style<K extends keyof ElementStyle>(k: K, v: ElementStyle[K]): void {
    this.set((e) => (e.style[k] = v));
  }

  protected numStyle(k: 'fontSize' | 'padding' | 'borderWidth', v: number | null): void {
    if (v != null && Number.isFinite(v)) this.style(k, Math.max(0, v));
  }
}
