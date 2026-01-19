import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
  status: 'testing' | 'initializing' | 'uploading' | 'finalizing' | 'complete' | 'error';
  error?: string;
  chunkSize?: number;
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
  // Chunk sizes to try (from largest to smallest)
  private readonly CHUNK_SIZES = [
    5 * 1024 * 1024,    // 5MB
    2 * 1024 * 1024,    // 2MB
    1 * 1024 * 1024,    // 1MB
    512 * 1024,         // 512KB
    256 * 1024,         // 256KB
    128 * 1024,         // 128KB
  ];

  // Delay between chunks to avoid overwhelming the server (ms)
  private readonly CHUNK_DELAY = 100;

  // Detected optimal chunk size (cached after first test)
  private detectedChunkSize: number | null = null;

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
   * Test what chunk size the server can handle
   */
  private async detectOptimalChunkSize(progressSubject: Subject<ChunkUploadProgress>): Promise<number> {
    // Use cached value if available
    if (this.detectedChunkSize !== null) {
      console.log(`Using cached chunk size: ${this.formatSize(this.detectedChunkSize)}`);
      return this.detectedChunkSize;
    }

    progressSubject.next({
      uploadId: '',
      chunksUploaded: 0,
      totalChunks: 0,
      percentage: 0,
      status: 'testing'
    });

    console.log('Testing optimal chunk size...');

    for (const size of this.CHUNK_SIZES) {
      try {
        console.log(`Testing chunk size: ${this.formatSize(size)}`);
        
        // Create a test blob of the specified size
        const testData = new Blob([new ArrayBuffer(size)]);
        const testFormData = new FormData();
        testFormData.append('test', testData, 'test_chunk');

        // Try to send a test request to check size limit
        // We use the init endpoint with a fake request to test
        const testInitForm = new FormData();
        testInitForm.append('filename', 'test.zip');
        testInitForm.append('total_chunks', '1');
        testInitForm.append('total_size', size.toString());
        testInitForm.append('dimension', 'overworld');

        await this.http.post<ApiResponse<ChunkUploadInit>>(
          `${this.path}/upload/init`,
          testInitForm
        ).toPromise();

        // If we get here, this size works
        // Now test actual chunk upload
        const initResponse = await this.http.post<ApiResponse<ChunkUploadInit>>(
          `${this.path}/upload/init`,
          testInitForm
        ).toPromise();

        if (initResponse?.data?.upload_id) {
          // Try to upload a chunk of this size
          const chunkFormData = new FormData();
          chunkFormData.append('upload_id', initResponse.data.upload_id);
          chunkFormData.append('chunk_index', '0');
          chunkFormData.append('chunk', testData, 'chunk_0');

          try {
            await this.http.post(`${this.path}/upload/chunk`, chunkFormData).toPromise();
            
            // Success! Cancel this test upload and use this size
            await this.http.delete(`${this.path}/upload/cancel/${initResponse.data.upload_id}`).toPromise();
            
            console.log(`Optimal chunk size detected: ${this.formatSize(size)}`);
            this.detectedChunkSize = size;
            return size;
          } catch (chunkError: any) {
            // Chunk upload failed, try smaller size
            await this.http.delete(`${this.path}/upload/cancel/${initResponse.data.upload_id}`).toPromise();
            
            if (this.isPayloadTooLarge(chunkError)) {
              console.log(`Chunk size ${this.formatSize(size)} too large, trying smaller...`);
              continue;
            }
            throw chunkError;
          }
        }
      } catch (error: any) {
        if (this.isPayloadTooLarge(error)) {
          console.log(`Size ${this.formatSize(size)} too large, trying smaller...`);
          continue;
        }
        // Other error, might be network issue - try smaller size anyway
        console.warn(`Error testing size ${this.formatSize(size)}:`, error.message);
        continue;
      }
    }

    // If all sizes fail, use the smallest
    const fallbackSize = this.CHUNK_SIZES[this.CHUNK_SIZES.length - 1];
    console.log(`Using fallback chunk size: ${this.formatSize(fallbackSize)}`);
    this.detectedChunkSize = fallbackSize;
    return fallbackSize;
  }

  /**
   * Check if error is a "payload too large" error
   */
  private isPayloadTooLarge(error: any): boolean {
    if (error instanceof HttpErrorResponse) {
      return error.status === 413 || error.status === 400;
    }
    return false;
  }

  /**
   * Perform the actual chunked upload process
   */
  private async performChunkedUpload(
    file: File,
    dimension: string,
    progressSubject: Subject<ChunkUploadProgress>
  ): Promise<void> {
    let uploadId = '';

    try {
      // Step 1: Detect optimal chunk size by testing
      const chunkSize = await this.detectOptimalChunkSize(progressSubject);
      const totalChunks = Math.ceil(file.size / chunkSize);

      console.log(`Will upload ${file.name} in ${totalChunks} chunks of ${this.formatSize(chunkSize)}`);

      // Step 2: Initialize upload
      progressSubject.next({
        uploadId: '',
        chunksUploaded: 0,
        totalChunks,
        percentage: 0,
        status: 'initializing',
        chunkSize
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

      // Step 3: Upload chunks ONE BY ONE (sequential, not parallel)
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunkBlob = file.slice(start, end);

        // Retry logic for each chunk
        let retries = 3;
        let success = false;

        while (retries > 0 && !success) {
          try {
            const chunkFormData = new FormData();
            chunkFormData.append('upload_id', uploadId);
            chunkFormData.append('chunk_index', chunkIndex.toString());
            chunkFormData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

            await this.http.post<ApiResponse<ChunkUploadStatus>>(
              `${this.path}/upload/chunk`,
              chunkFormData
            ).toPromise();

            success = true;
          } catch (error: any) {
            retries--;
            if (retries === 0) {
              throw new Error(`Failed to upload chunk ${chunkIndex} after 3 retries: ${error.message}`);
            }
            console.warn(`Chunk ${chunkIndex} failed, retrying... (${retries} retries left)`);
            // Wait a bit before retrying
            await this.delay(500);
          }
        }

        progressSubject.next({
          uploadId,
          chunksUploaded: chunkIndex + 1,
          totalChunks,
          percentage: Math.round(((chunkIndex + 1) / totalChunks) * 100),
          status: 'uploading',
          chunkSize
        });

        // Small delay between chunks to not overwhelm the server
        if (chunkIndex < totalChunks - 1) {
          await this.delay(this.CHUNK_DELAY);
        }
      }

      // Step 4: Finalize upload
      progressSubject.next({
        uploadId,
        chunksUploaded: totalChunks,
        totalChunks,
        percentage: 100,
        status: 'finalizing',
        chunkSize
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
        status: 'complete',
        chunkSize
      });

      progressSubject.complete();

    } catch (error: any) {
      progressSubject.next({
        uploadId,
        chunksUploaded: 0,
        totalChunks: 0,
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
   * Helper to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format bytes to human readable size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Cancel an ongoing chunked upload
   */
  cancelChunkedUpload(uploadId: string): Observable<any> {
    return this.http.delete(`${this.path}/upload/cancel/${uploadId}`);
  }

  /**
   * Determine if a file should use chunked upload
   * All files use chunked upload now for reliability
   */
  shouldUseChunkedUpload(file: File): boolean {
    // Use chunked upload for files larger than 1MB
    const CHUNKED_THRESHOLD = 1 * 1024 * 1024; // 1MB
    return file.size > CHUNKED_THRESHOLD;
  }

  /**
   * Reset detected chunk size (useful if network conditions change)
   */
  resetChunkSizeDetection(): void {
    this.detectedChunkSize = null;
  }
}
