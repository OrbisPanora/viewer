import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DataService, ChunkUploadProgress } from '../../services/data.service';
import { ApiConfigService, ApiMode } from '../../services/api-config.service';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.less',
  providers: [DataService]
})
export class HomePage {
  isDragOver = false;
  isUploading = false;
  mode: ApiMode;

  // Upload progress tracking
  uploadProgress: ChunkUploadProgress | null = null;
  private uploadSubscription: Subscription | null = null;

  // Default dimension for world upload
  private readonly DEFAULT_DIMENSION = 'overworld';

  constructor(
    private router: Router,
    private dataService: DataService,
    private apiConfig: ApiConfigService
  ) {
    this.mode = this.apiConfig.currentMode;
  }

  setMode(mode: ApiMode): void {
    this.mode = mode;
    this.apiConfig.setMode(mode);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  /**
   * Validate file type and trigger upload process
   */
  private async handleFile(file: File): Promise<void> {
    if (!this.isValidWorldFile(file)) {
      alert('Please upload a valid .zip file containing a complete Minecraft world');
      return;
    }

    this.isUploading = true;
    this.uploadProgress = null;

    try {
      // Use chunked upload for large files, regular upload for small files
      if (this.dataService.shouldUseChunkedUpload(file)) {
        await this.uploadWorldChunked(file);
      } else {
        await this.uploadWorldFile(file);
      }
      this.navigateToVisualizer();
    } catch (error) {
      this.handleUploadError(error);
    } finally {
      this.isUploading = false;
      this.uploadProgress = null;
    }
  }

  /**
   * Check if the file is a valid .zip file
   */
  private isValidWorldFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.zip');
  }

  /**
   * Upload world file using chunked upload for large files
   */
  private uploadWorldChunked(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Starting chunked upload for ${file.name} (${this.formatFileSize(file.size)})`);

      this.uploadSubscription = this.dataService.uploadWorldChunked(file, this.DEFAULT_DIMENSION)
        .subscribe({
          next: (progress) => {
            this.uploadProgress = progress;
            console.log(`Upload progress: ${progress.percentage}% (${progress.status})`);
          },
          error: (error) => {
            this.uploadSubscription = null;
            reject(error);
          },
          complete: () => {
            this.uploadSubscription = null;
            console.log('Chunked upload completed successfully');
            resolve();
          }
        });
    });
  }

  /**
   * Upload world file to API via DataService (for small files)
   */
  private async uploadWorldFile(file: File): Promise<void> {
    const formData = this.createUploadFormData(file);

    console.log('Uploading world file:', file.name);

    const response = await firstValueFrom(
      this.dataService.uploadWorld(formData)
    );

    console.log('World uploaded successfully:', response);
  }

  /**
   * Create FormData object with file and dimension
   */
  private createUploadFormData(file: File): FormData {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dimension', this.DEFAULT_DIMENSION);
    return formData;
  }

  /**
   * Navigate to visualizer page after successful upload
   */
  private navigateToVisualizer(): void {
    this.router.navigate(['/visualizer']);
  }

  /**
   * Handle upload errors and notify user
   */
  private handleUploadError(error: any): void {
    console.error('Failed to upload world:', error);
    alert('Failed to upload world. Please check the console for details.');
  }

  /**
   * Cancel ongoing upload
   */
  cancelUpload(): void {
    if (this.uploadSubscription) {
      this.uploadSubscription.unsubscribe();
      this.uploadSubscription = null;
    }
    if (this.uploadProgress?.uploadId) {
      this.dataService.cancelChunkedUpload(this.uploadProgress.uploadId).subscribe();
    }
    this.isUploading = false;
    this.uploadProgress = null;
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  /**
   * Get upload status message for display
   */
  getUploadStatusMessage(): string {
    if (!this.uploadProgress) return 'Uploading...';
    
    switch (this.uploadProgress.status) {
      case 'initializing':
        return 'Initializing upload...';
      case 'uploading':
        return `Uploading: ${this.uploadProgress.chunksUploaded}/${this.uploadProgress.totalChunks} chunks (${this.uploadProgress.percentage}%)`;
      case 'finalizing':
        return 'Finalizing and loading world...';
      case 'complete':
        return 'Upload complete!';
      case 'error':
        return `Error: ${this.uploadProgress.error}`;
      default:
        return 'Uploading...';
    }
  }
}
