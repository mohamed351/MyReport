/*
 * Public API of angular-my-report
 */
export { MyReportDesignerComponent } from './lib/ui/designer.component';
export { MyReportViewerComponent } from './lib/ui/viewer.component';
export { overrideDataSource, type DataOverride } from './lib/ui/designer.store';

// Report model and engine helpers, for building or processing report definitions in code.
export * from './lib/model/types';
export { newReport, sampleReport, emptyDataSource } from './lib/model/defaults';
export { receiptReport } from './lib/model/factories';
export { loadData, detectDataSource, type LoadResult, type FieldInfo } from './lib/engine/dataSources';
