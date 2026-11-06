import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BAND_LABELS } from '../../model/defaults';
import { DesignerStore } from '../designer.store';
import { removeGroup } from './report-props.component';

@Component({
  selector: 'rpt-band-props',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (band(); as b) {
      <h3>{{ labels[b.type] }}</h3>
      <section>
        <label class="prop-row"><span>Height</span>
          <div class="prop-value"><input type="number" min="0" [ngModel]="b.height" (ngModelChange)="setHeight($event)" /></div>
        </label>
        <div class="prop-row"><span>Elements</span><div class="prop-value">{{ b.elements.length }}</div></div>
      </section>
      @if (group(); as g) {
        <section>
          <h4>Group</h4>
          <label class="prop-row"><span>Group by</span>
            <div class="prop-value">
              <input list="field-names" placeholder="Field name" [ngModel]="g.field" (ngModelChange)="setGroup('field', $event)" />
            </div>
          </label>
          <label class="prop-row"><span>Order</span>
            <div class="prop-value">
              <select [ngModel]="g.direction" (ngModelChange)="setGroup('direction', $event)">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </label>
          <button class="danger" (click)="removeGroup(g.id)">Remove group</button>
        </section>
      }
      @if (!b.groupId) {
        <button class="danger" (click)="hide(b.id)">Remove section</button>
      }
      <p class="hint">Drag the bar under a band to resize it. Removed sections come back under Report → Sections. Aggregates in group bands cover the group's rows.</p>
    }
  `,
})
export class BandPropsComponent {
  private readonly store = inject(DesignerStore);
  readonly bandId = input.required<string>();
  protected readonly labels = BAND_LABELS;

  protected readonly band = computed(() => this.store.report().bands.find((b) => b.id === this.bandId()));
  protected readonly group = computed(() => {
    const gid = this.band()?.groupId;
    return gid ? this.store.report().groups.find((g) => g.id === gid) : undefined;
  });

  protected setHeight(v: number | null): void {
    if (v == null || !Number.isFinite(v)) return;
    const id = this.bandId();
    this.store.update((r) => (r.bands.find((b) => b.id === id)!.height = Math.max(0, v)));
  }

  /** Removes the section from the report (kept hidden with its elements, so it can be shown again). */
  protected hide(id: string): void {
    this.store.update((r) => {
      const b = r.bands.find((x) => x.id === id);
      if (b) b.visible = false;
    });
    this.store.select({ elementIds: [], bandId: null });
  }

  protected setGroup(k: 'field' | 'direction', v: string): void {
    const gid = this.group()?.id;
    this.store.update((r) => {
      const g = r.groups.find((x) => x.id === gid);
      if (!g) return;
      if (k === 'field') g.field = v;
      else g.direction = v as 'asc' | 'desc';
    });
  }

  protected removeGroup(gid: string): void {
    this.store.update((r) => removeGroup(r, gid));
  }
}
