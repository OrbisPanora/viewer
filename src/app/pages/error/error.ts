import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error.html',
  styleUrl: './error.less'
})
export class ErrorModalComponent {
  title = 'Erreur';
  message = '';
  buttonText = 'OK';

  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }
}
