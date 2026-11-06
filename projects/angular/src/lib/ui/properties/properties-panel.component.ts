import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DesignerStore, findElement } from '../designer.store';
import { ElementPropsComponent } from './element-props.component';
import { BandPropsComponent } from './band-props.component';
import { ReportPropsComponent } from './report-props.component';

/** Right-hand panel: properties of the selected element(s), else the selected band, else the report. */
@Component({
  selector: 'rpt-properties-panel',
  standalone: true,
  imports: [ElementPropsComponent, BandPropsComponent, ReportPropsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="panel right-panel">
      <datalist id="field-names">
        @for (f of store.data().fields; track f.name) {
          <option [value]="f.name"></option>
        }
      </datalist>
      @if (first(); as f) {
        <rpt-element-props [el]="f.el" [count]="store.selection().elementIds.length" />
      } @else if (bandId()) {
        <rpt-band-props [bandId]="bandId()!" />
      } @else {
        <rpt-report-props />
      }
    </aside>
  `,
})
export class PropertiesPanelComponent {
  protected readonly store = inject(DesignerStore);
  protected readonly first = computed(() => {
    const ids = this.store.selection().elementIds;
    return ids.length ? findElement(this.store.report(), ids[0]) : null;
  });
  protected readonly bandId = computed(() => this.store.selection().bandId);
}
