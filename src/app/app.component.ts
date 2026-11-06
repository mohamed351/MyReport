import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MyReportDesignerComponent, MyReportViewerComponent, newReport, receiptReport, sampleReport, type ReportDefinition } from 'angular-my-report';

const STORAGE_KEY = 'report-designer:current';

/**
 * Demo app for angular-my-report.
 *  /         → designer (autosaves to localStorage; starts with the sales sample)
 *  /viewer   → viewer. Query: ?report=<url> | ?template=sales|blank|receipt80|receipt58,
 *              ?datasource=<url>&type=json|odata, any other key = a report parameter.
 *              Without report/template it shows the designer's current report.
 */
@Component({
  selector: 'rpt-root',
  standalone: true,
  imports: [MyReportDesignerComponent, MyReportViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (viewerMode) {
      <myreport-viewer [path]="viewer.path" [report]="viewer.report" [datasource]="viewer.datasource" [type]="viewer.type" [params]="viewer.params" designerUrl="./" />
    } @else {
      <myreport-designer [report]="initialReport" [persistKey]="storageKey" viewerUrl="viewer" />
    }
  `,
})
export class AppComponent {
  protected readonly viewerMode = /\/viewer\/?$/i.test(location.pathname);
  protected readonly storageKey = STORAGE_KEY;
  /** First visit: the sales sample. Later: null, so the designer restores the autosaved report. */
  protected readonly initialReport: ReportDefinition | null = hasSaved() ? null : sampleReport();
  protected readonly viewer = viewerOptions();
}

function hasSaved(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function viewerOptions() {
  const q = new URLSearchParams(location.search);
  const templates: Record<string, () => ReportDefinition> = { sales: sampleReport, blank: newReport, receipt80: () => receiptReport(80), receipt58: () => receiptReport(58) };
  const template = q.get('template');
  const path = q.get('report');
  let report: ReportDefinition | string | null = template && templates[template] ? templates[template]() : null;
  if (!report && !path) {
    try {
      report = localStorage.getItem(STORAGE_KEY) ?? sampleReport();
    } catch {
      report = sampleReport();
    }
  }
  const params = new URLSearchParams(q);
  for (const k of ['template', 'report', 'datasource', 'type']) params.delete(k);
  return {
    path,
    report,
    datasource: q.get('datasource'),
    type: q.get('type') === 'odata' ? ('odata' as const) : ('json' as const),
    params: params.toString(),
  };
}
