import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { SafeImagePipe } from '../designer/safe-image.pipe';

const MAX_BYTES = 5 * 1024 * 1024;

/** Image source: a URL (may contain {Field}) or an uploaded file embedded as a base64 data URL. */
@Component({
  selector: 'rpt-image-picker',
  standalone: true,
  imports: [SafeImagePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="image-picker">
      @if (embedded()) {
        <div class="muted">Embedded image · {{ size() }}</div>
      } @else {
        <input [value]="value()" [placeholder]="placeholder()" (input)="valueChange.emit($any($event.target).value)" />
      }
      <div class="inline">
        <button class="small" (click)="file.click()">Upload…</button>
        @if (value()) {
          <button class="small" (click)="valueChange.emit('')">Remove</button>
        }
        <input #file type="file" accept="image/*" hidden (change)="upload($event)" />
      </div>
      @if (value() && !value().includes('{')) {
        <img class="thumb" alt="" [src]="value() | safeImage" />
      }
      @if (message()) {
        <div class="error">{{ message() }}</div>
      }
    </div>
  `,
})
export class ImagePickerComponent {
  readonly value = input('');
  readonly placeholder = input('https://… or {Field}');
  readonly valueChange = output<string>();

  protected readonly message = signal('');
  protected readonly embedded = computed(() => this.value().startsWith('data:'));
  /** Approximate decoded size of the embedded image. */
  protected readonly size = computed(() => {
    const bytes = Math.round(((this.value().length - this.value().indexOf(',') - 1) * 3) / 4);
    return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  });

  /** Reads the file as base64 (data URL) so the image travels inside the report file. */
  protected upload(e: Event): void {
    const inputEl = e.target as HTMLInputElement;
    const f = inputEl.files?.[0];
    inputEl.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return this.message.set('Please choose an image file.');
    if (f.size > MAX_BYTES) return this.message.set(`Image is ${(f.size / 1048576).toFixed(1)} MB; the limit is 5 MB.`);
    this.message.set('');
    const reader = new FileReader();
    reader.onload = () => this.valueChange.emit(String(reader.result));
    reader.onerror = () => this.message.set('Could not read the file.');
    reader.readAsDataURL(f);
  }
}
