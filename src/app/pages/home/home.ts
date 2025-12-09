import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.less'
})
export class HomePage {
  isDragOver = false;
  isUploading = false;

  constructor(private router: Router, private http: HttpClient) {}

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

  private async handleFile(file: File): Promise<void> {
    const fileName = file.name.toLowerCase();
    const isValidFile = fileName.endsWith('.zip');

    if (!isValidFile) {
      alert('Please upload a valid .zip file containing a complete Minecraft world');
      return;
    }

    this.isUploading = true;

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dimension', 'overworld'); // Default to overworld

      console.log('Uploading world file:', file.name);

      // Upload to API
      const response = await this.http.post(
        'http://localhost:8000/api/upload/world',
        formData
      ).toPromise();

      console.log('World uploaded successfully:', response);

      // Navigate to visualizer after successful upload
      this.router.navigate(['/visualizer']);

    } catch (error) {
      console.error('Failed to upload world:', error);
      alert('Failed to upload world. Please check the console for details.');
    } finally {
      this.isUploading = false;
    }
  }
}
