import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ApiResponse } from '../models/api-response.model';
import { ChunkData } from '../models/chunk-data.model';
import { ImageNom } from '../models/image-nom.model';
import { SurfaceBlocks } from '../models/surface-blocks.model';
import { ApiConfigService } from './api-config.service';

export interface ChunkUploadProgress {
  uploadId: string;
  chunksUploaded: number;
  totalChunks: number;
  percentage: number;
  status: 'initializing' | 'uploading' | 'finalizing' | 'complete' | 'error';
  error?: string;
}

export interface ChunkUploadInit {
  upload_id: string;
  chunk_size: number;
  message: string;
}

export interface ChunkUploadStatus {
  upload_id: string;
  chunks_received: number;
  total_chunks: number;
  is_complete: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  // Default chunk size: 5MB
  private readonly CHUNK_SIZE = 5 * 1024 * 1024;

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

  /**
   * Upload a large file using chunked upload
   * Returns an observable that emits progress updates
   */
  uploadWorldChunked(file: File, dimension: string = 'overworld'): Observable<ChunkUploadProgress> {
    const progressSubject = new Subject<ChunkUploadProgress>();

    this.performChunkedUpload(file, dimension, progressSubject);

    return progressSubject.asObservable();
  }

  /**
   * Perform the actual chunked upload process
   */
  private async performChunkedUpload(
    file: File,
    dimension: string,
    progressSubject: Subject<ChunkUploadProgress>
  ): Promise<void> {
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    let uploadId = '';

    try {
      // Step 1: Initialize upload
      progressSubject.next({
        uploadId: '',
        chunksUploaded: 0,
        totalChunks,
        percentage: 0,
        status: 'initializing'
      });

      const initFormData = new FormData();
      initFormData.append('filename', file.name);
      initFormData.append('total_chunks', totalChunks.toString());
      initFormData.append('total_size', file.size.toString());
      initFormData.append('dimension', dimension);

      const initResponse = await this.http.post<ApiResponse<ChunkUploadInit>>(
        `${this.path}/upload/init`,
        initFormData
      ).toPromise();

      if (!initResponse?.data?.upload_id) {
        throw new Error('Failed to initialize upload');
      }

      uploadId = initResponse.data.upload_id;

      // Step 2: Upload chunks one by one
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        const chunkFormData = new FormData();
        chunkFormData.append('upload_id', uploadId);
        chunkFormData.append('chunk_index', chunkIndex.toString());
        chunkFormData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

        await this.http.post<ApiResponse<ChunkUploadStatus>>(
          `${this.path}/upload/chunk`,
          chunkFormData
        ).toPromise();

        progressSubject.next({
          uploadId,
          chunksUploaded: chunkIndex + 1,
          totalChunks,
          percentage: Math.round(((chunkIndex + 1) / totalChunks) * 100),
          status: 'uploading'
        });
      }

      // Step 3: Finalize upload
      progressSubject.next({
        uploadId,
        chunksUploaded: totalChunks,
        totalChunks,
        percentage: 100,
        status: 'finalizing'
      });

      const finalizeFormData = new FormData();
      finalizeFormData.append('upload_id', uploadId);

      await this.http.post<ApiResponse<any>>(
        `${this.path}/upload/finalize`,
        finalizeFormData
      ).toPromise();

      progressSubject.next({
        uploadId,
        chunksUploaded: totalChunks,
        totalChunks,
        percentage: 100,
        status: 'complete'
      });

      progressSubject.complete();

    } catch (error: any) {
      progressSubject.next({
        uploadId,
        chunksUploaded: 0,
        totalChunks,
        percentage: 0,
        status: 'error',
        error: error.message || 'Upload failed'
      });
      progressSubject.error(error);

      // Try to cancel the upload to clean up server resources
      if (uploadId) {
        this.cancelChunkedUpload(uploadId).subscribe();
      }
    }
  }

  /**
   * Cancel an ongoing chunked upload
   */
  cancelChunkedUpload(uploadId: string): Observable<any> {
    return this.http.delete(`${this.path}/upload/cancel/${uploadId}`);
  }

  /**
   * Determine if a file should use chunked upload
   * Files larger than 10MB will use chunked upload
   */
  shouldUseChunkedUpload(file: File): boolean {
    const CHUNKED_THRESHOLD = 10 * 1024 * 1024; // 10MB
    return file.size > CHUNKED_THRESHOLD;
  }
}
