import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ChunkData } from '../models/chunk-data.model';
import { ImageNom } from '../models/image-nom.model';
import { SurfaceBlocks } from '../models/surface-blocks.model';
import { ApiConfigService } from './api-config.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfigService
  ) {}

  private get path(): string {
    return this.apiConfig.apiUrl + '/api';
  }

  getChunkData(chunkX: number, chunkZ: number, chunkH: number): Observable<ApiResponse<ChunkData>> {
    return this.http.get<ApiResponse<ChunkData>>(`${this.path}/chunks/${chunkX}/${chunkZ}/${chunkH}?mode=isometric`);
  }

  getBlockJSON(name: string): Observable<any> {
    return this.http.get(`block_models/${name}.json`);
  }

  getBlockIMG(name: string): Observable<Blob> {
    return this.http.get(`iso_blocks/${name}.webp`, { responseType: 'blob' });
  }

  getNomTexture(name: string, biome: string, properties: string): Observable<ApiResponse<ImageNom>> {
    return this.http.get<ApiResponse<ImageNom>>(`${this.path}/resources/json?id=${name}&namespace=minecraft&properties=${properties}&biome=${biome}`);
  }

  postDictBlocks(dict: { [key: string]: SurfaceBlocks[]; }): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.path}/resources/palette`, dict);
  }

  uploadWorld(formData: FormData): Observable<any> {
    // Note: path already lacks trailing slash? environment.apiUrl usually has no trailing slash.
    // constructor adds / to some paths?
    // Let's normalize. 
    return this.http.post(`${this.path}/upload/world`, formData);
  }

  checkWorldHealth(): Observable<{ world_loaded: boolean }> {
    return this.http.get<{ world_loaded: boolean }>(`${this.path}/worlds/health`);
  }


}
