import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  constructor(private http: HttpClient) {}

  getJSONData(name: string): Observable<any> {
    return this.http.get(`${name}.json`);
  }

  getBlockJSON(name: string): Observable<any> {
    return this.http.get(`block_models/${name}.json`);
  }

  getBlockIMG(name: string): Observable<Blob> {
    return this.http.get(`iso_blocks/${name}.webp`, { responseType: 'blob' });
  }
}