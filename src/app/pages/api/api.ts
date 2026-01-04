import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiConfigService } from '../../services/api-config.service';

@Component({
  selector: 'app-api',
  imports: [],
  templateUrl: './api.html',
  styleUrl: './api.less'
})
export class ApiPage {
  get apiDocsUrl(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      this.apiConfig.apiUrl + '/docs'
    );
  }

  constructor(
    private sanitizer: DomSanitizer,
    private apiConfig: ApiConfigService
  ) {}
}
