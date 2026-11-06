import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BandType, PageSettings, ReportDefinition } from '../../model/types';
import { BAND_LABELS, PAGE_SIZES, createBand, uid } from '../../model/defaults';
import { DesignerStore } from '../designer.store';
import { ReportExtrasComponent } from './report-extras.component';

export function removeGroup(r: ReportDefinition, gid: string): void {
  r.groups = r.groups.filter((g) => g.id !== gid);
  r.bands = r.bands.filter((b) => b.groupId !== gid);
}

const OPTIONAL_BANDS: BandType[] = ['reportHeader', 'pageHeader', 'detail', 'pageFooter', 'reportFooter'];
type PageKey = Exclude<keyof PageSettings, 'continuous'>;

@Component({
  selector: 'rpt-report-props',
  standalone: true,
  imports: [FormsModule, ReportExtrasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = report();
    <h3>Report</h3>
    <section>
      <label class="prop-row"><span>Name</span>
        <div class="prop-value"><input [ngModel]="r.name" (ngModelChange)="setName($event)" /></div>
      </label>
    </section>

    <section>
      <h4>Page</h4>
      <label class="prop-row"><span>Size</span>
        <div class="prop-value">
          <select [ngModel]="sizeName()" (ngModelChange)="setSize($event)">
            @for (k of sizeNames; track k) {
              <option [value]="k">{{ k }}</option>
            }
            @if (sizeName() === 'Custom') {
              <option value="Custom">Custom</option>
            }
          </select>
        </div>
      </label>
      <label class="prop-row"><span>Orientation</span>
        <div class="prop-value">
          <select [ngModel]="landscape() ? 'landscape' : 'portrait'" (ngModelChange)="setOrientation($event)">
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
      </label>
      <div class="grid2">
        @for (f of pageFields; track f.key) {
          <label class="prop-row"><span>{{ f.label }}</span>
            <div class="prop-value">
              <input type="number" [min]="f.min" [ngModel]="r.page[f.key]" (ngModelChange)="setPage(f.key, f.min, $event)" />
            </div>
          </label>
        }
      </div>
      <label class="check" title="Receipt roll: one page as long as its content, no page breaks">
        <input type="checkbox" [ngModel]="!!r.page.continuous" (ngModelChange)="setContinuous($event)" /> Continuous (receipt roll, no page breaks)
      </label>
      <p class="hint">Units are pixels at 96 DPI (A4 = 794 × 1123, 80 mm receipt = 302 wide).</p>
    </section>

    <section>
      <h4>Sections</h4>
      @for (t of optionalBands; track t) {
        <label class="check">
          <input type="checkbox" [ngModel]="isVisible(t)" (ngModelChange)="setVisible(t, $event)" />
          {{ labels[t] }}
        </label>
      }
      <p class="hint">Without Detail, the report prints its header/footer once — fields there show the first/last record, or use sum(), count()… for totals.</p>
    </section>

    <section>
      <h4>Groups</h4>
      @for (g of r.groups; track g.id; let i = $index) {
        <div class="group-row">
          <span class="muted">{{ i + 1 }}.</span>
          <input list="field-names" placeholder="Field name" [ngModel]="g.field" (ngModelChange)="setGroupField(g.id, $event)" />
          <button class="small danger" title="Remove group" (click)="deleteGroup(g.id)">✕</button>
        </div>
      }
      <button (click)="addGroup()">+ Add group</button>
    </section>

    <section>
      <h4>Sort</h4>
      @for (s of r.sort; track $index; let i = $index) {
        <div class="group-row">
          <input list="field-names" placeholder="Field name" [ngModel]="s.field" (ngModelChange)="setSort(i, 'field', $event)" />
          <select [ngModel]="s.direction" (ngModelChange)="setSort(i, 'direction', $event)">
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          <button class="small danger" (click)="removeSort(i)">✕</button>
        </div>
      }
      <button (click)="addSort()">+ Add sort</button>
    </section>

    <rpt-report-extras />
  `,
})
export class ReportPropsComponent {
  private readonly store = inject(DesignerStore);
  protected readonly report = this.store.report;
  protected readonly labels = BAND_LABELS;
  protected readonly optionalBands = OPTIONAL_BANDS;
  protected readonly sizeNames = Object.keys(PAGE_SIZES);
  protected readonly pageFields: { key: PageKey; label: string; min: number }[] = [
    { key: 'width', label: 'Width', min: 100 },
    { key: 'height', label: 'Height', min: 100 },
    { key: 'marginTop', label: 'Margin Top', min: 0 },
    { key: 'marginBottom', label: 'Margin Bottom', min: 0 },
    { key: 'marginLeft', label: 'Margin Left', min: 0 },
    { key: 'marginRight', label: 'Margin Right', min: 0 },
  ];

  protected readonly landscape = computed(() => this.report().page.width > this.report().page.height);
  protected readonly sizeName = computed(() => {
    const p = this.report().page;
    const hit = Object.entries(PAGE_SIZES).find(
      ([, s]) => (s.width === p.width && s.height === p.height) || (s.width === p.height && s.height === p.width),
    );
    return hit?.[0] ?? 'Custom';
  });

  protected setName(v: string): void {
    this.store.update((r) => (r.name = v));
  }

  protected setSize(name: string): void {
    const s = PAGE_SIZES[name];
    if (!s) return;
    const land = this.landscape();
    const receipt = name.startsWith('Receipt');
    this.store.update((r) => {
      r.page.width = land && !receipt ? s.height : s.width;
      r.page.height = land && !receipt ? s.width : s.height;
      if (receipt) {
        // Thermal roll: narrow margins, page as long as the content.
        r.page.continuous = true;
        r.page.marginLeft = r.page.marginRight = name.includes('58') ? 6 : 10;
        r.page.marginTop = 10;
        r.page.marginBottom = 14;
      } else r.page.continuous = false;
    });
  }

  protected setContinuous(on: boolean): void {
    this.store.update((r) => (r.page.continuous = on));
  }

  protected setOrientation(v: string): void {
    if ((v === 'landscape') !== this.landscape()) this.store.update((r) => ([r.page.width, r.page.height] = [r.page.height, r.page.width]));
  }

  protected setPage(k: PageKey, min: number, v: number | null): void {
    if (v != null && Number.isFinite(v)) this.store.update((r) => (r.page[k] = Math.max(min, v)));
  }

  protected isVisible(t: BandType): boolean {
    return !!this.report().bands.find((b) => b.type === t)?.visible;
  }

  protected setVisible(t: BandType, on: boolean): void {
    this.store.update((r) => {
      const ex = r.bands.find((x) => x.type === t);
      if (ex) ex.visible = on;
      else r.bands.push(createBand(t, 30));
    });
  }

  protected setGroupField(gid: string, v: string): void {
    this.store.update((r) => {
      const g = r.groups.find((x) => x.id === gid);
      if (g) g.field = v;
    });
  }

  protected deleteGroup(gid: string): void {
    this.store.update((r) => removeGroup(r, gid));
  }

  protected addGroup(): void {
    this.store.update((r) => {
      const id = uid('grp');
      r.groups.push({ id, field: '', direction: 'asc' });
      r.bands.push(createBand('groupHeader', 26, id), createBand('groupFooter', 26, id));
    });
  }

  protected setSort(i: number, k: 'field' | 'direction', v: string): void {
    this.store.update((r) => {
      if (k === 'field') r.sort[i].field = v;
      else r.sort[i].direction = v as 'asc' | 'desc';
    });
  }

  protected removeSort(i: number): void {
    this.store.update((r) => r.sort.splice(i, 1));
  }

  protected addSort(): void {
    this.store.update((r) => r.sort.push({ field: '', direction: 'asc' }));
  }
}
