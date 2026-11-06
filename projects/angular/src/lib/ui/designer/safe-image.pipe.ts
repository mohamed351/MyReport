import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';

/**
 * Image source for <img [src]>. Angular's sanitizer rejects some data: images (e.g. SVG); uploads
 * are embedded as data:image/… URLs, so those are trusted here. An <img> never runs scripts.
 */
@Pipe({ name: 'safeImage', standalone: true })
export class SafeImagePipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(url: string | null | undefined): SafeUrl | string {
    if (!url) return '';
    return /^data:image\//i.test(url) ? this.sanitizer.bypassSecurityTrustUrl(url) : url;
  }
}
