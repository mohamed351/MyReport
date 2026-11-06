import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PageBackground, ParameterType, ReportParameter, Watermark } from '../../model/types';
import { defaultBackground, defaultWatermark } from '../../model/defaults';
import { DesignerStore } from '../designer.store';
import { ExprInputComponent } from './expr-input.component';
import { ImagePickerComponent } from './image-picker.component';

/** Report-level settings: parameters, row filter, watermark and page background. */
@Component({
  selector: 'rpt-report-extras',
  standalone: true,
  imports: [FormsModule, ExprInputComponent, ImagePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <h4>Parameters</h4>
      @for (p of parameters(); track $index; let i = $index) {
        <div class="col-card">
          <div class="col-head">
            <strong>&#64;{{ p.name || '?' }}</strong><span class="spacer"></span>
            <button class="small danger" title="Remove parameter" (click)="removeParam(i)">✕</button>
          </div>
          <div class="grid2">
            <label class="prop-row"><span>Name</span>
              <div class="prop-value"><input [ngModel]="p.name" placeholder="Country" (ngModelChange)="setParam(i, 'name', clean($event))" /></div>
            </label>
            <label class="prop-row"><span>Type</span>
              <div class="prop-value">
                <select [ngModel]="p.type" (ngModelChange)="setParam(i, 'type', $event)">
                  @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
                </select>
              </div>
            </label>
          </div>
          <label class="prop-row"><span>Label</span>
            <div class="prop-value"><input [ngModel]="p.label" placeholder="Shown in the preview" (ngModelChange)="setParam(i, 'label', $event)" /></div>
          </label>
          <label class="prop-row"><span>Default</span>
            <div class="prop-value"><input [ngModel]="p.defaultValue" (ngModelChange)="setParam(i, 'defaultValue', $event)" /></div>
          </label>
          <label class="prop-row"><span>Choices</span>
            <div class="prop-value"><input [ngModel]="p.options" placeholder="Egypt, USA, France (optional)" (ngModelChange)="setParam(i, 'options', $event)" /></div>
          </label>
        </div>
      }
      <button (click)="addParam()">+ Add parameter</button>
      <p class="hint">
        Use as <code>&#64;Name</code> in formulas, <code>{{ '{' }}&#64;Name{{ '}' }}</code> in the data source URL or OData filter
        (e.g. <code>Country eq '{{ '{' }}&#64;Country{{ '}' }}'</code>), or pass in the page address: <code>?Country=Egypt</code>.
      </p>
    </section>

    <section>
      <h4>Filter rows</h4>
      <rpt-expr-input mode="expression" [value]="filter()" placeholder="e.g. Country == @Country" (valueChange)="setFilter($event)" />
      <p class="hint">Only rows where this is true are printed. Empty = all rows.</p>
    </section>

    <section>
      @let w = watermark();
      <h4>Watermark</h4>
      <label class="check"><input type="checkbox" [ngModel]="w.enabled" (ngModelChange)="setWm('enabled', $event)" /> Show watermark</label>
      @if (w.enabled) {
        <div class="tabs">
          <button [class.on]="w.kind === 'text'" (click)="setWm('kind', 'text')">Text</button>
          <button [class.on]="w.kind === 'image'" (click)="setWm('kind', 'image')">Image</button>
        </div>
        @if (w.kind === 'text') {
          <rpt-expr-input [value]="w.text" placeholder="CONFIDENTIAL" (valueChange)="setWm('text', $event)" />
          <div class="grid2">
            <label class="prop-row"><span>Size</span>
              <div class="prop-value"><input type="number" min="8" [ngModel]="w.fontSize" (ngModelChange)="num($event, 'fontSize', 8)" /></div>
            </label>
            <div class="prop-row"><span>Color</span>
              <div class="prop-value">
                <input type="color" [ngModel]="w.color" (ngModelChange)="setWm('color', $event)" />
                <label class="check"><input type="checkbox" [ngModel]="w.bold" (ngModelChange)="setWm('bold', $event)" /> Bold</label>
              </div>
            </div>
          </div>
        } @else {
          <rpt-image-picker [value]="w.image" placeholder="https://…/logo.png" (valueChange)="setWm('image', $event)" />
          <label class="prop-row"><span>Width %</span>
            <div class="prop-value"><input type="number" min="5" max="200" [ngModel]="w.imageScale" (ngModelChange)="num($event, 'imageScale', 5)" /></div>
          </label>
        }
        <label class="prop-row"><span>Opacity</span>
          <div class="prop-value">
            <input type="range" min="0.02" max="1" step="0.01" [ngModel]="w.opacity" (ngModelChange)="setWm('opacity', +$event)" />
            <span class="muted">{{ (w.opacity * 100).toFixed(0) }}%</span>
          </div>
        </label>
        <label class="prop-row"><span>Angle</span>
          <div class="prop-value">
            <input type="range" min="-90" max="90" step="1" [ngModel]="w.angle" (ngModelChange)="setWm('angle', +$event)" />
            <span class="muted">{{ w.angle }}°</span>
          </div>
        </label>
        <div class="grid2">
          <label class="prop-row"><span>Layer</span>
            <div class="prop-value">
              <select [ngModel]="w.layer" (ngModelChange)="setWm('layer', $event)">
                <option value="front">In front</option>
                <option value="behind">Behind</option>
              </select>
            </div>
          </label>
          <label class="prop-row"><span>Pages</span>
            <div class="prop-value">
              <select [ngModel]="w.pages" (ngModelChange)="setWm('pages', $event)">
                <option value="all">All</option>
                <option value="first">First only</option>
              </select>
            </div>
          </label>
        </div>
      }
    </section>

    <section>
      @let b = background();
      <h4>Background image</h4>
      <label class="check"><input type="checkbox" [ngModel]="b.enabled" (ngModelChange)="setBg('enabled', $event)" /> Page background</label>
      @if (b.enabled) {
        <rpt-image-picker [value]="b.image" placeholder="https://…/letterhead.png" (valueChange)="setBg('image', $event)" />
        <div class="grid2">
          <label class="prop-row"><span>Fit</span>
            <div class="prop-value">
              <select [ngModel]="b.fit" (ngModelChange)="setBg('fit', $event)">
                <option value="cover">Cover page</option>
                <option value="contain">Contain</option>
                <option value="stretch">Stretch</option>
                <option value="center">Center (actual size)</option>
              </select>
            </div>
          </label>
          <label class="prop-row"><span>Pages</span>
            <div class="prop-value">
              <select [ngModel]="b.pages" (ngModelChange)="setBg('pages', $event)">
                <option value="all">All</option>
                <option value="first">First only</option>
              </select>
            </div>
          </label>
        </div>
        <p class="hint">Fills the whole sheet behind everything (e.g. a letterhead). For a see-through mark, use Watermark.</p>
      }
    </section>
  `,
})
export class ReportExtrasComponent {
  private readonly store = inject(DesignerStore);
  protected readonly types: ParameterType[] = ['string', 'number', 'date', 'boolean'];
  protected readonly parameters = computed(() => this.store.report().parameters ?? []);
  protected readonly filter = computed(() => this.store.report().filter ?? '');
  protected readonly watermark = computed(() => ({ ...defaultWatermark(), ...this.store.report().watermark }));
  protected readonly background = computed(() => ({ ...defaultBackground(), ...this.store.report().background }));

  /** Parameter names: letters, digits and _ only (they are used as @Name). */
  protected clean(v: string): string {
    return v.replace(/[^\wÀ-￿]/g, '');
  }

  protected addParam(): void {
    this.store.update((r) => {
      const n = (r.parameters?.length ?? 0) + 1;
      r.parameters = [...(r.parameters ?? []), { name: `Param${n}`, label: '', type: 'string', defaultValue: '', options: '' }];
    });
  }

  protected setParam<K extends keyof ReportParameter>(i: number, k: K, v: ReportParameter[K]): void {
    this.store.update((r) => {
      const p = r.parameters?.[i];
      if (p) p[k] = v;
    });
  }

  protected removeParam(i: number): void {
    this.store.update((r) => r.parameters?.splice(i, 1));
  }

  protected setFilter(v: string): void {
    this.store.update((r) => (r.filter = v || undefined));
  }

  protected setWm<K extends keyof Watermark>(k: K, v: Watermark[K]): void {
    this.store.update((r) => (r.watermark = { ...defaultWatermark(), ...r.watermark, [k]: v }));
  }

  protected num(v: number | null, k: 'fontSize' | 'imageScale', min: number): void {
    if (v != null && Number.isFinite(v)) this.setWm(k, Math.max(min, v));
  }

  protected setBg<K extends keyof PageBackground>(k: K, v: PageBackground[K]): void {
    this.store.update((r) => (r.background = { ...defaultBackground(), ...r.background, [k]: v }));
  }
}
