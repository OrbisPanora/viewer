import { Component, ElementRef, ViewChild, PLATFORM_ID, inject  } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { DataService } from '../../services/data.service';
import * as PIXI from 'pixi.js';
import { Atlas } from '../../services/atlas';
import { Chunk } from '../../factories/chunk';
import { firstValueFrom, Observable, BehaviorSubject } from 'rxjs';
import { MouseEvents } from '../../events/mouse';


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
  public atlasLoader = new Atlas();
  public chunk!: Chunk;
  protected dragging: boolean=false;
  public mouseX : BehaviorSubject<number> = new BehaviorSubject<number>(0);
  public mouseY : BehaviorSubject<number> = new BehaviorSubject<number>(0);

  //public dragging: boolean=false;

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
      let x = 0;
      let y = 0;

      // this.mouseEvent();
      // console.log(this.mouseX, this.mouseY);

      

      // this.app.canvas.addEventListener('mousemove', (e) => {
      //   x = e.clientX;
      //   y = e.clientY;
      // });

      // this.app.ticker.add(() => {
      //   // const screenWidth = this.app.renderer.width;
      //   // const screenHeight = this.app.renderer.height;

      //   // const targetX = (x / screenWidth) * (worldSize - screenWidth);
      //   // const targetY = (y / screenHeight) * (worldSize - screenHeight);

      //   // worldContainer.x += (-targetX - worldContainer.x) * 0.1;
      //   // worldContainer.y += (-targetY - worldContainer.y) * 0.1;
      // });

      console.log('mouse position:', x, y);

      let cont = new PIXI.Container({isRenderGroup: true});
      cont.x = 0;
      cont.y = 0;
      this.app.stage.addChild(cont);

      console.log(cont.width, cont.height);

      // let gg = new PIXI.Graphics().rect(20, 5, this.app.canvas.width, this.app.canvas.width).fill(0xffff00);
      // cont.addChild(gg);
      

      
      


      ///////////

      let start = performance.now();
      let data = await firstValueFrom(this.dataService.getJSONData("", -6, 3));
      let coords = data.data.surface_blocks as (string | number)[][];
      let end = performance.now();
      console.log("Durée chargement API :", (end - start)/1000, "s");

      start = performance.now();
      await this.atlasLoader.load('iso_cube.json');
      let atlas = this.atlasLoader.getAtlas();

      this.chunk = new Chunk(22, atlas, coords);
      this.chunk.setXY(700, 100);
      //this.app.stage.addChild(this.chunk.getTilemap());
      cont.addChild(this.chunk.getTilemap());
      
      this.chunk.printInfo();
      let zoom = 1;
      this.chunk.zoom(zoom);
      //this.app.stage.addChild(this.chunk.backGroundColor(0xFF0000, zoom));
      console.log(cont.x, cont.y, cont.width, cont.height);

      
      let gg = new PIXI.Graphics().rect(20, 5, cont.width, cont.height).fill(0xffff00);
      cont.addChild(gg);

      console.log(cont.x, cont.y, cont.width, cont.height);
      
      console.log(gg.width, gg.height);

      ////////////
      this.app.stage.eventMode = 'static';

      this.app.stage.on('pointerdown', (e) => {
          console.log("Pointer down :", e.global.x, e.global.y);

          // Activer le drag
          this.dragging = true;
      });

      this.app.stage.on('pointermove', (e) => {
          if (!this.dragging) return;

          
          console.log("Pointer move :", e.global.x, e.global.y);
      });

      this.app.stage.on('pointerup', () => {
          console.log("Pointer up");
          this.dragging = false;
      });
      
      ///////////



      


      // const backGround = this.chunk.backGroundColor(0xFF0000);
      // backGround.scale.set(2);
      // this.app.stage.addChild(backGround);


      // // trouver la logique pour charger les chunks dynamiquement (avec coordoonennées generales)
      // data = await firstValueFrom(this.dataService.getJSONData("", -5, 3));
      // coords = data.data.surface_blocks as (string | number)[][];
      // this.chunk = new Chunk(1, atlas, coords);
      // this.app.stage.addChild(this.chunk.getTilemap());
      // // //x=400, y=100, i=1, j=0.5, w=32, h=16  x(i*w/2 j*h/2)+y(-i*w/2 j*h/2)=x*i*w/2+y*-i*w/2 + x*j*h/2+y*j*h/2=(x-y)*i*w/2 +(x+y)*j*h/2
      // this.chunk.setXY(700+zoom*256, 100+zoom*128);
      // this.chunk.printInfo();
      // this.chunk.zoom(zoom);
      // this.app.stage.addChild(this.chunk.backGroundColor(0x00FF00, zoom));

      // data = await firstValueFrom(this.dataService.getJSONData("", -6, 4));
      // coords = data.data.surface_blocks as (string | number)[][];
      // this.chunk = new Chunk(1, atlas, coords);
      // this.app.stage.addChild(this.chunk.getTilemap());
      // // //x=400, y=100, i=1, j=0.5, w=32, h=16  x(i*w/2 j*h/2)+y(-i*w/2 j*h/2)=x*i*w/2+y*-i*w/2 + x*j*h/2+y*j*h/2=(x-y)*i*w/2 +(x+y)*j*h/2
      // this.chunk.setXY(700-zoom*256, 100+zoom*128);
      // this.chunk.printInfo();
      // this.chunk.zoom(zoom);
      // this.app.stage.addChild(this.chunk.backGroundColor(0x0000FF, zoom));


      //end = performance.now();
      //console.log("Durée affichage :", (end - start)/1000, "s");
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

  private mouseEvent(): void {
    this.app.stage.eventMode = 'static';

    this.app.stage.on('pointerdown', (e) => {
        console.log("Pointer down :", e.global.x, e.global.y);
        // Activer le drag
        this.dragging = true;
    });

    this.app.stage.on('pointermove', (e) => {
        if (!this.dragging) return;
        this.mouseX.next(e.global.x);
        this.mouseY.next(e.global.y);
        //console.log("Pointer move :", e.global.x, e.global.y);
    });

    this.app.stage.on('pointerup', () => {
        console.log("Pointer up");
        this.dragging = false;
    });
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
