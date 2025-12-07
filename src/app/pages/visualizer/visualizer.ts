import { Component, ElementRef, ViewChild, PLATFORM_ID, inject  } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { DataService } from '../../services/data.service';
import { SurfaceFactory } from '../../factories/surface.factory';
import * as PIXI from 'pixi.js';
import { Tilemap } from '@pixi/tilemap';


//import JSONK from '../../../../public/test5.json';

@Component({
  selector: 'app-visualizer',
  imports: [],
  templateUrl: './visualizer.html',
  styleUrl: './visualizer.less',
  providers: [DataService]
})
export class VisualizerPage  { //implements AfterViewInit

  private platformId = inject(PLATFORM_ID);
  public app!: PIXI.Application;
  public surfaceFactory!: SurfaceFactory;
  public tilemap!: Tilemap;
  public atlas!: any;

  @ViewChild('canvasContainer', {static: true}) canvasContainer!: ElementRef;

  constructor(private router: Router, private dataService: DataService) {}

  goBack(): void {
    this.router.navigate(['/']);
  }

  async ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return; // Skip on server-side rendering
    }

    await this.initPixiScene();

    try {
      this.atlas = await PIXI.Assets.load('iso_cube.json');

      // Ne pas passer toutes les textures, Tilemap les charge automatiquement depuis l'atlas
      this.tilemap = new Tilemap([this.atlas.textureSource]);
      this.app.stage.addChild(this.tilemap);

      let decalex = 16;
      let decaley = 16;
      let decalez = 16;
      let x = 0;
      let y = 0;
      let tileW = 32;
      let tileH = 16;
      // 32x16
      const offsetX = window.innerWidth / 2 - (decalex - decaley) * (tileW / 4);
      const offsetY = window.innerHeight / 2 - (decalex + decaley) * (tileH / 4) - decalez * (tileH / 2);
      for (let k = decalez; k > 0; k--) {
        for (let i = 0; i < decalex; i++) {
          for (let j = 0; j < decaley; j++) {
            x = offsetX + (i - j) * tileW/2; //window.innerWidth/2 500
            y = offsetY + (i + j) * tileH/2 + k*tileH; //window.innerHeight
            this.tilemap.tile(this.atlas.textures['gold_ore.webp'], x, y);
          }
        }
      }  

      //this.tilemap.tile(this.atlas.textures['iron_ore.webp'], 0, 0);

      console.log('Sprite chargé avec succès');
    } catch (error) {
      console.error('Erreur lors du chargement du sprite:', error);
    }
  }

  private async initPixiScene() {
    this.app = new PIXI.Application();
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x77b5fe,
      antialias: true,     // Enable antialiasing
      resolution: 1,       // Resolution / device pixel ratio
      preference: 'webgl', // or 'webgpu' // Renderer preference
    });

    //document.body.appendChild(this.app.canvas);
    this.canvasContainer.nativeElement.appendChild(this.app.canvas);

    // Ajouter un gestionnaire de redimensionnement
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private onWindowResize() {
    if (!this.app) return;

    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }

  ngOnDestroy() {
    // a verifier
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.app) {
      this.app.destroy(true);
    }

    window.removeEventListener('resize', () => this.onWindowResize());
  }
}
