import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ChunkData } from '../models/chunk-data.model';
import { ImageNom } from '../models/image-nom.model';
import { SurfaceBlocks } from '../models/surface-blocks.model';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private path: string;

  constructor(private http: HttpClient) {
    this.path = 'http://localhost:8000/api/';
  }

  getJSONData(name: string, x: number, y: number): Observable<ApiResponse<ChunkData>> {
    return  this.http.get<ApiResponse<ChunkData>>(`http://localhost:8000/api/chunks/${x}/${y}?mode=isometric`); //`data/${name}.json`
  }

  getBlockJSON(name: string): Observable<any> {
    return this.http.get(`block_models/${name}.json`);
  }

  getBlockIMG(name: string): Observable<Blob> {
    return this.http.get(`iso_blocks/${name}.webp`, { responseType: 'blob' });
  }

  getNomTexture(name: string, biome: string, properties: string): Observable<ApiResponse<ImageNom>> {
    return this.http.get<ApiResponse<ImageNom>>(`http://localhost:8000/api/resources/json?id=${name}&namespace=minecraft&properties=${properties}&biome=${biome}`);
    //http://localhost:8000/api/resources/json?id=gold_block&namespace=minecraft&properties=%7B%7D&biome=biome
  }

  postDictBlocks(dict : {[key: string]: SurfaceBlocks[]; }): Observable<any>{
    return this.http.post<ApiResponse<any>>("http://localhost:8000/api/resources/palette", dict);
  }

  uploadWorld(formData: FormData): Observable<any> {
    return this.http.post(`${this.path}upload/world`, formData);
  }

  checkWorldHealth(): Observable<{ world_loaded: boolean }> {
    return this.http.get<{ world_loaded: boolean }>(`${this.path}worlds/health`);
  }


}
