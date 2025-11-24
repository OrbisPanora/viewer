import * as THREE from 'three';
import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { DataService } from './services/data.service';
import { SurfaceFactory } from './factories/surface.factory';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.less',
  providers: [DataService]
})
export class App {
  protected readonly title = signal('web');

  public dataService: any = inject(DataService);
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera; //THREE.OrthographicCamera; //THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public surfaceFactory!: SurfaceFactory;

  private animate() {
    requestAnimationFrame(() => this.animate());

    this.renderer.render(this.scene, this.camera);
  }

  async ngOnInit() {
    this.initScene();

    let geometry_top = this.surfaceFactory.createBlockGeometry(0.32, 0.16);
    let geometry_side = this.surfaceFactory.createBlockGeometry(0.16, 0.24);





  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x77b5fe);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);

    this.surfaceFactory = new SurfaceFactory();
  }

  private cameraXAnime() {
    this.camera.position.z = 4;
    this.camera.position.y = 0;
    this.camera.position.x = 0;

    this.animate();
  }

}
