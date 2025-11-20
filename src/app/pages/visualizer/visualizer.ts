import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-visualizer',
  imports: [],
  templateUrl: './visualizer.html',
  styleUrl: './visualizer.less'
})
export class VisualizerPage {
  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigate(['/']);
  }
}
