import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home';
import { VisualizerPage } from './pages/visualizer/visualizer';
import { DocumentationPage } from './pages/documentation/documentation';
import { ApiPage } from './pages/api/api';
import { AboutPage } from './pages/about/about';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'visualizer', component: VisualizerPage },
  { path: 'documentation', component: DocumentationPage },
  { path: 'api', component: ApiPage },
  { path: 'about', component: AboutPage },
  { path: '**', redirectTo: '' }
];
