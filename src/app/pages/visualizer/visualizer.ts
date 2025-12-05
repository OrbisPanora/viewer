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
  public atlas!: any;
  //public texture: PIXI.TextureSource<any>[] = [];

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
    rectangle.rect(100, 100, 50, 50);
    rectangle.fill({ color: 0xff0000 });
    this.app.stage.addChild(rectangle);

    try {
      this.atlas = await PIXI.Assets.load('minecraftAtlas.json');

      // this.app.stage.addChild(sprite);

      console.log(this.atlas);
      console.log(this.atlas.textureSource);

      // Ne pas passer toutes les textures, Tilemap les charge automatiquement depuis l'atlas
      this.tilemap = new Tilemap([this.atlas.textureSource]);
      this.app.stage.addChild(this.tilemap);

      //console.log(this.atlas.textures['bedrock_top.webp']);

      this.tilemap.tile(this.atlas.textures['bedrock_top.webp'], 200, 200);
      this.tilemap.tile(this.atlas.textures['bedrock_left.webp'], 200, 208);
      this.tilemap.tile(this.createTextureS(this.atlas.textures['bedrock_left.webp']), 216, 208);


      // let decalex = 10;
      // let decaley = 10;
      // let x = 0;
      // let y = 0;
      // for (let i = 0; i < decalex; i++) {
      //   for (let j = 0; j < decaley; j++) {
      //     x = (i - j) * 32/2 + decalex*32;
      //     y = (i + j) * 16/2 + decaley*16;
      //     this.tilemap.tile(this.createTextureS(this.texture[0]), x, y);

      //   }
      // }
      // this.tilemap.tile(this.texture, 100, 100);
      // this.tilemap.tile(this.texture, 200, 200);
      // this.tilemap.tile(this.texture, 300, 300);   

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

  private createTextureS(tex: PIXI.Texture): PIXI.Texture {
    // sprite préparé (tint, scale…)
    const sprite = new PIXI.Sprite(tex);
    sprite.tint = 0x7F7F7F;
    sprite.scale.x = -1;
    sprite.anchor.set(0.5);
    sprite.position.set(tex.width / 2, tex.height / 2); // Important pour anchor

    // créer une render texture
    const rt = PIXI.RenderTexture.create({
        width: tex.width,
        height: tex.height
    });

    // dessiner le sprite DANS la RenderTexture
    this.app.renderer.render({
      container: sprite,
      target: rt
    });

    // utiliser rt comme texture finale
    return rt;
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
