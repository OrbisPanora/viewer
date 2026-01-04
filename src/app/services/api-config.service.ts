import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../config';

export type ApiMode = 'locale' | 'hosted';

@Injectable({
  providedIn: 'root'
})
export class ApiConfigService {
  private mode$ = new BehaviorSubject<ApiMode>('locale');

  get currentMode(): ApiMode {
    return this.mode$.value;
  }

  get apiUrl(): string {
    return environment.apiUrls[this.mode$.value];
  }

  setMode(mode: ApiMode): void {
    this.mode$.value !== mode && this.mode$.next(mode);
  }
}
