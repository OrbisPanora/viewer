import { Component, ElementRef, ViewChild, PLATFORM_ID, inject  } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { DataService } from '../../services/data.service';
import { SurfaceFactory } from '../../factories/surface.factory';
import * as PIXI from 'pixi.js';
import { Tilemap } from '@pixi/tilemap';
import { Sprite } from 'three';


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
  public texture!: PIXI.TextureSource<any>;

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

    //let atlas = await PIXI.Assets.load('atlas.json');

    // Créer un simple rectangle
    const rectangle = new PIXI.Graphics();
    rectangle.rect(8, 0, 20, 10);
    rectangle.fill({ color: 0xff0000 });
    this.app.stage.addChild(rectangle);

    try {
      this.texture = await PIXI.Assets.load('iso_blocks/bedrock_top.webp');//atlas.textures['tile_01.png'];

      let sprite = PIXI.Sprite.from(this.texture);
      // sprite.scale.set(2,2);

      // this.tilemap = new Tilemap([this.texture]);
      // this.app.stage.addChild(this.tilemap);

      // this.tilemap.tile(this.texture, 100, 0);
      // this.tilemap.tile(this.texture, 200, 0);
      // this.tilemap.tile(this.texture, 300, 0);   

      sprite.position.set(
        6,
        0
      );

      // Ajouter le sprite à la scène
      this.app.stage.addChild(sprite);

      console.log('Sprite chargé avec succès');
    } catch (error) {
      console.error('Erreur lors du chargement du sprite:', error);
    }


    // Start adding content to your application
    // const texture = await Assets.load('your-image.png');
    // const sprite = new Sprite(texture);
    // app.stage.addChild(sprite);
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
