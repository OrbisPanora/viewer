import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '../../config';

@Component({
  selector: 'app-api',
  imports: [],
  templateUrl: './api.html',
  styleUrl: './api.less'
})
export class ApiPage {
  readonly apiDocsUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    this.apiDocsUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      environment.apiUrl + '/docs'
    );
  }
}
