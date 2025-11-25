import { Component, inject, signal, AfterViewInit, PLATFORM_ID  } from '@angular/core';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { DataService } from '../../services/data.service';
import { SurfaceFactory } from '../../factories/surface.factory';
import { BlockTwoFactory } from '../../factories/block-two.factory';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-visualizer',
  imports: [],
  templateUrl: './visualizer.html',
  styleUrl: './visualizer.less',
  providers: [DataService]
})
export class VisualizerPage implements AfterViewInit {
  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigate(['/']);
  }

  public dataService: any = inject(DataService);
  private platformId = inject(PLATFORM_ID);
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera; //THREE.OrthographicCamera; //THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public surfaceFactory!: SurfaceFactory;
  public textureLoader!: THREE.TextureLoader;

  private animate() {
    requestAnimationFrame(() => this.animate());

    this.renderer.render(this.scene, this.camera);
  }

  async ngOnInit() {
    // Empty - initialization moved to ngAfterViewInit for SSR compatibility
  }

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return; // Skip on server-side rendering
    }

    this.initScene();
    this.surfaceFactory = new BlockTwoFactory('iso_blocks/bedrock_top.webp', 'iso_blocks/bedrock_left.webp', this.textureLoader);

    let blockModel = await this.surfaceFactory.create();
    this.scene.add(blockModel.meshTop);
    this.scene.add(blockModel.meshSide);

    this.cameraXAnime();
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x77b5fe);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);
    this.textureLoader = new THREE.TextureLoader();
  }

  private cameraXAnime() {
    this.camera.position.z = 1;
    this.camera.position.y = 0;
    this.camera.position.x = 0;

    this.animate();
  }
}
